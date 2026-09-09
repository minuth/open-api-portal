import { Hono } from 'hono'
import { jsx } from 'hono/jsx'
import { ApiExecutorService } from '../services/api-executor'
import { ResponsePanel } from '../components/response-panel'
import { ProxyTimeoutError } from '../types/errors'
import { logServerError } from '../utils/logger'
import { joseEngineService } from '../services/jose-engine'
import { JoseSecurityExtension, EphemeralKeyInput, JoseTransformMeta, JoseResponseMeta } from '../types/jose'
import { ActualRequestData } from '../types/openapi'
import { buildAuthHeadersAndQuery } from '../utils/auth-metadata'
import { ClientAuthConfig } from '../types/auth'

export const proxyApp = new Hono()
const executorService = new ApiExecutorService()

interface KeyValuePair {
  key: string
  value: string
  enabled?: boolean
}

function buildActualRequestData(
  method: string,
  targetUrl: string,
  queryParams: Record<string, string>,
  headers: Record<string, string>,
  body?: string
): ActualRequestData {
  const urlObj = new URL(targetUrl)
  for (const [key, val] of Object.entries(queryParams)) {
    if (val !== undefined && val !== null && val !== '') {
      urlObj.searchParams.append(key, val)
    }
  }
  const fullUrl = urlObj.toString()
  const pathWithQuery = urlObj.pathname + (urlObj.search || '')

  const reqHeaders: Record<string, string> = { ...headers }
  if (body && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json'
  }
  if (!reqHeaders['host'] && !reqHeaders['Host']) {
    reqHeaders['Host'] = urlObj.host
  }
  if (body && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
    reqHeaders['Content-Length'] = String(Buffer.byteLength(body, 'utf8'))
  }

  // Raw HTTP text representation (standard RFC wire format)
  const headerLines = Object.entries(reqHeaders)
    .map(([hName, hVal]) => `${hName}: ${hVal}`)
    .join('\r\n')

  const rawHttp = `${method.toUpperCase()} ${pathWithQuery} HTTP/1.1\r\n${headerLines}\r\n\r\n${body || ''}`

  // Format copyable cURL command
  let curl = `curl -X ${method.toUpperCase()} '${fullUrl}'`
  for (const [hName, hVal] of Object.entries(reqHeaders)) {
    if (hName.toLowerCase() === 'host' || hName.toLowerCase() === 'content-length') continue
    const escapedHVal = hVal.replace(/'/g, `'\\''`)
    curl += ` \\\n  -H '${hName}: ${escapedHVal}'`
  }
  if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    const escapedBody = body.replace(/'/g, `'\\''`)
    curl += ` \\\n  --data-raw '${escapedBody}'`
  }

  return {
    method: method.toUpperCase(),
    url: fullUrl,
    headers: reqHeaders,
    body,
    rawHttp,
    curlCommand: curl
  }
}

proxyApp.post('/api/proxy', async (c) => {
  let targetUrl = ''
  let method = 'GET'
  let actualRequest: ActualRequestData | undefined

  try {
    const bodyData = await c.req.parseBody()

    const baseUrl = ((bodyData['baseUrl'] as string) || '').trim()
    let pathTemplate = ((bodyData['pathTemplate'] as string) || '').trim()
    method = ((bodyData['method'] as string) || 'GET').trim()
    const rawBody = (bodyData['body'] as string) || undefined

    const queryParamsJson = (bodyData['queryParamsJson'] as string) || '[]'
    const headersJson = (bodyData['headersJson'] as string) || '[]'
    const pathParamsJson = (bodyData['pathParamsJson'] as string) || '[]'

    // 1. Substitute Path Parameters
    let pathParamsMap: Record<string, string> = {}
    try {
      if (typeof pathParamsJson === 'string' && pathParamsJson.trim().startsWith('{')) {
        pathParamsMap = JSON.parse(pathParamsJson)
      } else if (typeof pathParamsJson === 'string' && pathParamsJson.trim().startsWith('[')) {
        const arr = JSON.parse(pathParamsJson)
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item && item.name && item.value !== undefined) {
              pathParamsMap[item.name] = String(item.value)
            }
          }
        }
      }
    } catch {
      pathParamsMap = {}
    }

    // Also collect any direct form fields or pathParams[name] form fields
    for (const [key, val] of Object.entries(bodyData)) {
      if (typeof val === 'string') {
        if (key.startsWith('pathParams[')) {
          const paramName = key.substring(11, key.length - 1)
          pathParamsMap[paramName] = val
        } else if (key.startsWith('pathParams.')) {
          const paramName = key.substring(11)
          pathParamsMap[paramName] = val
        }
      }
    }

    // Replace all path variables in pathTemplate (e.g. {petId}) with actual user input values
    pathTemplate = pathTemplate.replace(/\{([^}]+)\}/g, (match, pName) => {
      const val = pathParamsMap[pName] ?? (typeof bodyData[pName] === 'string' ? bodyData[pName] : undefined)
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return encodeURIComponent(String(val).trim())
      }
      return match
    })

    // Construct final target URL
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    const cleanPath = pathTemplate.startsWith('/') ? pathTemplate : `/${pathTemplate}`
    targetUrl = `${cleanBaseUrl}${cleanPath}`

    // 2. Parse Query Parameters
    const queryParams: Record<string, string> = {}
    try {
      const qList: KeyValuePair[] = JSON.parse(queryParamsJson)
      for (const item of qList) {
        if (item.enabled !== false && item.key.trim()) {
          queryParams[item.key.trim()] = item.value
        }
      }
    } catch {
      // Ignore parse error
    }

    // 3. Parse Headers
    const headers: Record<string, string> = {}
    try {
      const hList: KeyValuePair[] = JSON.parse(headersJson)
      for (const item of hList) {
        if (item.enabled !== false && item.key.trim()) {
          headers[item.key.trim()] = item.value
        }
      }
    } catch {
      // Ignore parse error
    }

    // 3b. Parse Auth Configuration and merge credentials
    const authJson = (bodyData['authJson'] as string) || ''
    if (authJson && authJson.trim()) {
      try {
        const authConfig = JSON.parse(authJson) as ClientAuthConfig
        const authResult = buildAuthHeadersAndQuery(authConfig)
        Object.assign(headers, authResult.headers)
        Object.assign(queryParams, authResult.queryParams)
      } catch {
        // Ignore invalid auth config JSON
      }
    }

    // 4. In-Memory JOSE Cryptographic Pipeline (Zero Server Persistence)
    let finalBody = rawBody
    let finalHeaders = headers
    let joseMeta: JoseTransformMeta | undefined

    const joseSecurityJson = (bodyData['joseSecurityJson'] as string) || ''
    const joseHeadersJson = (bodyData['joseHeadersJson'] as string) || ''
    const joseSignHeadersJson = (bodyData['joseSignHeadersJson'] as string) || ''
    const joseEncHeadersJson = (bodyData['joseEncHeadersJson'] as string) || ''
    const joseClaimsJson = (bodyData['joseClaimsJson'] as string) || ''
    const joseEncClaimsJson = (bodyData['joseEncClaimsJson'] as string) || ''
    const joseKeyContent = (bodyData['joseKeyContent'] as string) || ''
    const joseKid = (bodyData['joseKid'] as string) || ''
    const josePassphrase = (bodyData['josePassphrase'] as string) || undefined

    // Dual-key inputs
    const joseSigningKeyContent = (bodyData['joseSigningKeyContent'] as string) || ''
    const joseSigningKid = (bodyData['joseSigningKid'] as string) || ''
    const joseSigningPassphrase = (bodyData['joseSigningPassphrase'] as string) || undefined
    const joseEncryptionKeyContent = (bodyData['joseEncryptionKeyContent'] as string) || ''
    const joseEncryptionKid = (bodyData['joseEncryptionKid'] as string) || ''

    const hasAnyKey = joseKeyContent.trim() || joseSigningKeyContent.trim() || joseEncryptionKeyContent.trim()

    if (joseSecurityJson && hasAnyKey) {
      try {
        const joseConfig = JSON.parse(joseSecurityJson) as JoseSecurityExtension

        interface TypedKeyValueItem {
          key: string
          value: unknown
          type?: 'text' | 'boolean' | 'date' | 'datetime' | 'unix' | 'uuid'
          autoNow?: boolean
          isCrit?: boolean
          enabled?: boolean
        }

        const processTypedItem = (item: TypedKeyValueItem): unknown => {
          const itemType = item.type || 'text'

          // Handle autoNow for date, datetime, unix
          if (item.autoNow) {
            if (itemType === 'unix') {
              return Math.floor(Date.now() / 1000)
            }
            if (itemType === 'datetime') {
              return new Date().toISOString()
            }
            if (itemType === 'date') {
              return new Date().toISOString().split('T')[0]
            }
          }

          let val: unknown = item.value
          if (itemType === 'boolean') {
            return val === true || val === 'true'
          }
          if (itemType === 'unix') {
            const num = Number(val)
            return isNaN(num) ? Math.floor(Date.now() / 1000) : Math.floor(num)
          }
          if (itemType === 'uuid' || itemType === 'date' || itemType === 'datetime' || itemType === 'text') {
            return typeof val === 'string' ? val : String(val ?? '')
          }

          // Fallback heuristic for arbitrary text/numbers
          if (val === 'true') return true
          if (val === 'false') return false
          if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') return Number(val)
          if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
            try {
              return JSON.parse(val)
            } catch {}
          }
          return val
        }

        const parseHeaderList = (jsonStr: string): { headers: Record<string, unknown>; crit: string[] } => {
          if (!jsonStr || !jsonStr.trim()) return { headers: {}, crit: [] }
          try {
            const parsed = JSON.parse(jsonStr) as TypedKeyValueItem[]
            if (!Array.isArray(parsed)) return { headers: {}, crit: [] }
            const headers: Record<string, unknown> = {}
            const crit: string[] = []
            for (const item of parsed) {
              if (item.enabled !== false && item.key && item.key.trim()) {
                const k = item.key.trim()
                headers[k] = processTypedItem(item)
                if (item.isCrit) {
                  crit.push(k)
                }
              }
            }
            return { headers, crit }
          } catch {
            return { headers: {}, crit: [] }
          }
        }

        const parseClaimList = (jsonStr: string): Record<string, unknown> => {
          if (!jsonStr || !jsonStr.trim()) return {}
          try {
            const parsed = JSON.parse(jsonStr) as TypedKeyValueItem[]
            if (!Array.isArray(parsed)) return {}
            const claims: Record<string, unknown> = {}
            for (const item of parsed) {
              if (item.enabled !== false && item.key && item.key.trim()) {
                claims[item.key.trim()] = processTypedItem(item)
              }
            }
            return claims
          } catch {
            return {}
          }
        }

        // Apply JWS protected headers
        const signParsed = parseHeaderList(joseSignHeadersJson)
        // Apply JWE protected headers
        const encParsed = parseHeaderList(joseEncHeadersJson)
        // Fallback to legacy joseHeadersJson if neither specific header is provided
        const legacyParsed = (!joseSignHeadersJson && !joseEncHeadersJson && joseHeadersJson)
          ? parseHeaderList(joseHeadersJson)
          : { headers: {}, crit: [] }

        if (joseConfig.sign) {
          const effectiveSignHeaders = { ...legacyParsed.headers, ...signParsed.headers }
          const effectiveSignCrit = Array.from(new Set([...legacyParsed.crit, ...signParsed.crit]))

          joseConfig.sign.customHeaders = {
            ...(joseConfig.sign.customHeaders || {}),
            ...effectiveSignHeaders
          }
          if (effectiveSignCrit.length > 0) {
            joseConfig.sign.crit = Array.from(new Set([
              ...(joseConfig.sign.crit || []),
              ...effectiveSignCrit
            ]))
          }
          if ('b64' in effectiveSignHeaders && typeof effectiveSignHeaders['b64'] === 'boolean') {
            joseConfig.sign.b64 = effectiveSignHeaders['b64']
            delete joseConfig.sign.customHeaders['b64']
          }

          // Parse and merge custom JWS payload claims
          const activeSignClaims = parseClaimList(joseClaimsJson)
          if (Object.keys(activeSignClaims).length > 0) {
            joseConfig.sign.claims = {
              ...(joseConfig.sign.claims || {}),
              ...activeSignClaims
            }
          }
        }

        if (joseConfig.encrypt) {
          const effectiveEncHeaders = { ...legacyParsed.headers, ...encParsed.headers }
          const effectiveEncCrit = Array.from(new Set([...legacyParsed.crit, ...encParsed.crit]))

          joseConfig.encrypt.customHeaders = {
            ...(joseConfig.encrypt.customHeaders || {}),
            ...effectiveEncHeaders
          }
          if (effectiveEncCrit.length > 0) {
            joseConfig.encrypt.crit = Array.from(new Set([
              ...(joseConfig.encrypt.crit || []),
              ...effectiveEncCrit
            ]))
          }
          if ('cty' in effectiveEncHeaders && typeof effectiveEncHeaders['cty'] === 'string') {
            joseConfig.encrypt.cty = effectiveEncHeaders['cty']
          }
          if ('zip' in effectiveEncHeaders && (effectiveEncHeaders['zip'] === 'DEF' || effectiveEncHeaders['zip'] === 'def')) {
            joseConfig.encrypt.zip = 'DEF'
          }

          // Parse and merge custom JWE payload claims
          const activeEncClaims = parseClaimList(joseEncClaimsJson)
          if (Object.keys(activeEncClaims).length > 0) {
            joseConfig.encrypt.claims = {
              ...(joseConfig.encrypt.claims || {}),
              ...activeEncClaims
            }
          }
        }
        const ephemeralKey: EphemeralKeyInput = {
          keyContent: joseKeyContent.trim() || joseSigningKeyContent.trim() || joseEncryptionKeyContent.trim(),
          kid: joseKid.trim() || undefined,
          passphrase: josePassphrase,
          signingKeyContent: joseSigningKeyContent.trim() || undefined,
          signingKid: joseSigningKid.trim() || undefined,
          signingPassphrase: joseSigningPassphrase,
          encryptionKeyContent: joseEncryptionKeyContent.trim() || undefined,
          encryptionKid: joseEncryptionKid.trim() || undefined
        }
        const transformed = await joseEngineService.processOutgoingRequest(
          finalBody,
          finalHeaders,
          joseConfig,
          ephemeralKey
        )
        finalHeaders = transformed.headers
        finalBody = transformed.body
        joseMeta = transformed.meta
      } catch (joseErr: unknown) {
        const msg = joseErr instanceof Error ? joseErr.message : String(joseErr)
        return c.html(<ResponsePanel error={`JOSE Security Processing Error: ${msg}`} />)
      }
    }

    // Capture the exact outgoing HTTP request data with real payload and headers
    actualRequest = buildActualRequestData(method, targetUrl, queryParams, finalHeaders, finalBody)

    // Execute Proxy Request
    const result = await executorService.execute({
      targetUrl,
      method,
      queryParams,
      headers: finalHeaders,
      body: finalBody
    })

    // 5. Response Processing: Auto-Decryption & Verification
    let finalResult = result
    let responseJoseMeta: JoseResponseMeta | undefined

    if (joseSecurityJson && result.body) {
      try {
        const joseConfig = JSON.parse(joseSecurityJson) as JoseSecurityExtension
        const keyForDecryption = joseKeyContent.trim() || joseSigningKeyContent.trim() || joseEncryptionKeyContent.trim()
        const ephemeralKey: EphemeralKeyInput | undefined = keyForDecryption ? {
          keyContent: keyForDecryption,
          kid: (joseKid.trim() || joseSigningKid.trim() || joseEncryptionKid.trim()) || undefined,
          passphrase: josePassphrase || joseSigningPassphrase
        } : undefined

        const processedResponse = await joseEngineService.processIncomingResponse(
          result.body,
          result.headers,
          joseConfig,
          ephemeralKey
        )

        if (processedResponse.meta?.decrypted || processedResponse.meta?.verified) {
          finalResult = {
            ...result,
            body: processedResponse.body,
            headers: processedResponse.headers
          }
          responseJoseMeta = processedResponse.meta
        }
      } catch {
        // Fallback to original result if response decryption fails
      }
    }

    return c.html(
      <ResponsePanel
        result={finalResult}
        request={actualRequest}
        joseMeta={joseMeta}
        responseJoseMeta={responseJoseMeta}
      />
    )
  } catch (err: unknown) {
    logServerError(`POST /api/proxy (${method} ${targetUrl})`, err)

    let errorMsg = err instanceof Error ? err.message : String(err)
    if (err instanceof ProxyTimeoutError) {
      errorMsg = `Request timed out: ${err.message}`
    }

    return c.html(<ResponsePanel error={errorMsg} request={actualRequest} />)
  }
})
