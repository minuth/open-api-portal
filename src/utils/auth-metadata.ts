import { EndpointOperation, OpenApiDocument, SecurityScheme } from '../types/openapi'
import { AuthType, ApiKeyPlacement, ClientAuthConfig, ResolvedSecuritySchemeInfo, ParsedJwtInfo } from '../types/auth'

/**
 * Resolves the effective security schemes applicable to a specific endpoint operation.
 * OpenAPI 3.0 specification rules:
 * - If operation.security is defined (including empty array []), it overrides root security.
 * - If operation.security is undefined, it inherits root.security.
 */
export function resolveEndpointSecurity(
  endpoint: EndpointOperation,
  spec: OpenApiDocument
): {
  isSecured: boolean
  isExplicitlyUnsecured: boolean
  schemes: ResolvedSecuritySchemeInfo[]
  primaryScheme?: ResolvedSecuritySchemeInfo
} {
  const specSchemes = spec.securitySchemes || {}

  // Check if operation explicitly defines security
  const opSecurity = endpoint.security
  const globalSecurity = spec.globalSecurity || []

  // If endpoint.security is [] (empty array), it explicitly overrides and disables security
  if (opSecurity !== undefined && opSecurity.length === 0) {
    return {
      isSecured: false,
      isExplicitlyUnsecured: true,
      schemes: []
    }
  }

  const effectiveRequirements = (opSecurity !== undefined ? opSecurity : globalSecurity) || []
  if (effectiveRequirements.length === 0) {
    return {
      isSecured: false,
      isExplicitlyUnsecured: false,
      schemes: []
    }
  }

  const resolvedList: ResolvedSecuritySchemeInfo[] = []

  for (const req of effectiveRequirements) {
    for (const [schemeName, scopes] of Object.entries(req)) {
      const schemeDef = specSchemes[schemeName] as SecurityScheme | undefined
      if (schemeDef) {
        resolvedList.push(mapSecurityScheme(schemeName, schemeDef, scopes))
      } else {
        // Fallback for undeclared scheme name
        resolvedList.push({
          name: schemeName,
          type: inferAuthTypeFromName(schemeName),
          specType: 'unknown',
          scopes: Array.isArray(scopes) ? scopes : []
        })
      }
    }
  }

  return {
    isSecured: resolvedList.length > 0,
    isExplicitlyUnsecured: false,
    schemes: resolvedList,
    primaryScheme: resolvedList[0]
  }
}

/**
 * Maps an OpenAPI SecurityScheme object into our standardized ResolvedSecuritySchemeInfo
 */
export function mapSecurityScheme(
  name: string,
  scheme: SecurityScheme,
  scopes: string[] = []
): ResolvedSecuritySchemeInfo {
  const typeLower = (scheme.type || '').toLowerCase()
  let authType: AuthType = 'none'
  let placement: ApiKeyPlacement | undefined

  if (typeLower === 'http') {
    const sLower = (scheme.scheme || '').toLowerCase()
    if (sLower === 'bearer') {
      authType = 'bearer'
    } else if (sLower === 'basic') {
      authType = 'basic'
    } else {
      authType = 'bearer'
    }
  } else if (typeLower === 'apikey') {
    authType = 'apiKey'
    const inLower = (scheme.in || '').toLowerCase()
    placement = inLower === 'query' ? 'query' : inLower === 'cookie' ? 'cookie' : 'header'
  } else if (typeLower === 'oauth2') {
    authType = 'oauth2'
  } else if (typeLower === 'openidconnect') {
    authType = 'openIdConnect'
  } else {
    authType = inferAuthTypeFromName(name)
  }

  return {
    name,
    type: authType,
    specType: scheme.type || 'http',
    description: scheme.description,
    keyName: scheme.name || (authType === 'apiKey' ? name : undefined),
    placement,
    scheme: scheme.scheme,
    bearerFormat: scheme.bearerFormat,
    flows: scheme.flows,
    openIdConnectUrl: scheme.openIdConnectUrl,
    scopes: Array.isArray(scopes) ? scopes : []
  }
}

/**
 * Infers an auth type from scheme name if spec definition is incomplete
 */
function inferAuthTypeFromName(name: string): AuthType {
  const n = name.toLowerCase()
  if (n.includes('bearer') || n.includes('jwt') || n.includes('token')) return 'bearer'
  if (n.includes('apikey') || n.includes('api_key') || n.includes('key')) return 'apiKey'
  if (n.includes('basic') || n.includes('auth')) return 'basic'
  if (n.includes('oauth')) return 'oauth2'
  return 'custom'
}

/**
 * Converts a ClientAuthConfig into concrete HTTP headers and query parameters
 */
export function buildAuthHeadersAndQuery(auth: ClientAuthConfig): {
  headers: Record<string, string>
  queryParams: Record<string, string>
} {
  const headers: Record<string, string> = {}
  const queryParams: Record<string, string> = {}

  if (!auth || auth.type === 'none') {
    return { headers, queryParams }
  }

  switch (auth.type) {
    case 'bearer':
    case 'oauth2':
    case 'openIdConnect': {
      if (auth.token && auth.token.trim()) {
        const cleanToken = auth.token.trim().replace(/^Bearer\s+/i, '')
        headers['Authorization'] = `Bearer ${cleanToken}`
      }
      break
    }

    case 'apiKey': {
      const kName = auth.apiKeyName ? auth.apiKeyName.trim() : 'X-API-KEY'
      const kVal = auth.apiKeyValue ? auth.apiKeyValue.trim() : ''
      if (kName && kVal) {
        if (auth.apiKeyPlacement === 'query') {
          queryParams[kName] = kVal
        } else if (auth.apiKeyPlacement === 'cookie') {
          headers['Cookie'] = `${kName}=${kVal}`
        } else {
          // Default: header
          headers[kName] = kVal
        }
      }
      break
    }

    case 'basic': {
      const u = auth.username || ''
      const p = auth.password || ''
      if (u || p) {
        const encoded = Buffer.from(`${u}:${p}`).toString('base64')
        headers['Authorization'] = `Basic ${encoded}`
      }
      break
    }

    case 'custom': {
      const hName = auth.customHeaderName ? auth.customHeaderName.trim() : ''
      const hVal = auth.customHeaderValue ? auth.customHeaderValue.trim() : ''
      if (hName && hVal) {
        headers[hName] = hVal
      }
      break
    }
  }

  return { headers, queryParams }
}

/**
 * Safely parses and decodes a JWT string client-side or server-side
 */
export function decodeJwtPayload(tokenStr: string): ParsedJwtInfo {
  const fallback: ParsedJwtInfo = {
    valid: false,
    header: {},
    payload: {},
    rawHeader: '',
    rawPayload: ''
  }

  if (!tokenStr || typeof tokenStr !== 'string') return fallback
  const parts = tokenStr.trim().split('.')
  if (parts.length < 2) return fallback

  try {
    const decodeBase64Url = (str: string): string => {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      return Buffer.from(b64, 'base64').toString('utf8')
    }

    const header = JSON.parse(decodeBase64Url(parts[0])) as Record<string, unknown>
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>

    const exp = typeof payload.exp === 'number' ? payload.exp : undefined
    const iat = typeof payload.iat === 'number' ? payload.iat : undefined
    const nowSec = Math.floor(Date.now() / 1000)

    let isExpired: boolean | undefined
    let expiresIn: string | undefined

    if (exp !== undefined) {
      if (exp < nowSec) {
        isExpired = true
        const diff = nowSec - exp
        expiresIn = `Expired ${formatDuration(diff)} ago`
      } else {
        isExpired = false
        const diff = exp - nowSec
        expiresIn = `Expires in ${formatDuration(diff)}`
      }
    }

    return {
      valid: true,
      header,
      payload,
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      iss: typeof payload.iss === 'string' ? payload.iss : undefined,
      aud: typeof payload.aud === 'string' ? payload.aud : Array.isArray(payload.aud) ? payload.aud.join(', ') : undefined,
      exp,
      iat,
      isExpired,
      expiresIn,
      rawHeader: JSON.stringify(header, null, 2),
      rawPayload: JSON.stringify(payload, null, 2)
    }
  } catch {
    return fallback
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) return `${hours}h ${remainingMinutes}m`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

/**
 * Returns human-readable presentation labels for a resolved security scheme.
 */
export function formatSchemeDisplay(scheme: ResolvedSecuritySchemeInfo): {
  typeLabel: string
  placementLabel: string
} {
  switch (scheme.type) {
    case 'bearer':
      return {
        typeLabel: scheme.bearerFormat ? `HTTP Bearer (${scheme.bearerFormat})` : 'HTTP Bearer',
        placementLabel: 'Header (Authorization: Bearer <token>)'
      }
    case 'apiKey':
      return {
        typeLabel: 'API Key',
        placementLabel: scheme.placement === 'query'
          ? `Query Parameter (?${scheme.keyName || 'api_key'}=...)`
          : scheme.placement === 'cookie'
          ? `Cookie (${scheme.keyName || 'cookie'}=...)`
          : `Header (${scheme.keyName || 'X-API-KEY'}: ...)`
      }
    case 'basic':
      return {
        typeLabel: 'HTTP Basic Auth',
        placementLabel: 'Header (Authorization: Basic <base64>)'
      }
    case 'oauth2':
      return {
        typeLabel: 'OAuth 2.0',
        placementLabel: 'Header (Authorization: Bearer <token>)'
      }
    case 'openIdConnect':
      return {
        typeLabel: 'OpenID Connect',
        placementLabel: 'Header (Authorization: Bearer <token>)'
      }
    default:
      return {
        typeLabel: scheme.specType || 'Custom Auth',
        placementLabel: scheme.keyName ? `Header (${scheme.keyName})` : 'Header'
      }
  }
}

