import * as yaml from 'js-yaml'
import {
  ISpecParser,
  OpenApiDocument,
  EndpointOperation,
  ServerItem,
  ParameterItem,
  ResponseItem,
  RequestBodySchema,
  SecurityScheme,
  SecurityRequirement,
  TagObject,
  InfoObject,
  ComponentsObject,
  ExternalDocumentation,
  HeaderObject,
  MediaTypeObject,
  SchemaObject
} from '../types/openapi'
import { JoseSecurityExtension, JoseSignatureConfig, JoseEncryptionConfig } from '../types/jose'
import { InvalidSpecError } from '../types/errors'

export class SpecParserService implements ISpecParser {
  public async parseYaml(
    yamlContent: string,
    specId?: string,
    filename?: string
  ): Promise<OpenApiDocument> {
    if (!yamlContent || !yamlContent.trim()) {
      throw new InvalidSpecError('YAML content is empty')
    }

    let rawDoc: Record<string, unknown>
    try {
      rawDoc = yaml.load(yamlContent) as Record<string, unknown>
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new InvalidSpecError(`YAML Syntax error: ${msg}`)
    }

    if (typeof rawDoc !== 'object' || rawDoc === null) {
      throw new InvalidSpecError('Root YAML structure must be an object')
    }

    const openapi = (rawDoc.openapi as string) || (rawDoc.swagger as string)
    if (!openapi) {
      throw new InvalidSpecError('Missing "openapi" or "swagger" version declaration')
    }

    // 1. Info & ExternalDocs
    const rawInfo = (rawDoc.info as Record<string, unknown>) || {}
    const info: InfoObject = {
      title: (rawInfo.title as string) || filename || 'Untitled API',
      version: (rawInfo.version as string) || '1.0.0',
      description: rawInfo.description as string | undefined,
      termsOfService: rawInfo.termsOfService as string | undefined,
      contact: rawInfo.contact as InfoObject['contact'],
      license: rawInfo.license as InfoObject['license']
    }

    const externalDocs = this.normalizeExternalDocs(rawDoc.externalDocs)

    // 2. Servers Parsing & Variable Expansion
    const servers: ServerItem[] = []
    if (Array.isArray(rawDoc.servers)) {
      for (const s of rawDoc.servers as Array<Record<string, unknown>>) {
        if (s && typeof s.url === 'string') {
          let url = s.url
          // Expand server variables with defaults
          if (s.variables && typeof s.variables === 'object') {
            for (const [vName, vObj] of Object.entries(s.variables as Record<string, { default: string }>)) {
              if (vObj && typeof vObj.default === 'string') {
                url = url.replace(new RegExp(`\\{${vName}\\}`, 'g'), vObj.default)
              }
            }
          }
          servers.push({
            url,
            description: s.description as string | undefined,
            variables: s.variables as ServerItem['variables']
          })
        }
      }
    } else if (typeof rawDoc.host === 'string') {
      const schemes = Array.isArray(rawDoc.schemes) ? (rawDoc.schemes as string[]) : ['https']
      const basePath = (rawDoc.basePath as string) || ''
      for (const scheme of schemes) {
        servers.push({
          url: `${scheme}://${rawDoc.host}${basePath}`,
          description: `Server (${scheme.toUpperCase()})`
        })
      }
    }

    if (servers.length === 0) {
      servers.push({ url: 'http://localhost:3000', description: 'Default fallback server' })
    }

    // 3. Tags
    const tagMap = new Map<string, TagObject>()
    if (Array.isArray(rawDoc.tags)) {
      for (const t of rawDoc.tags as Array<Record<string, unknown>>) {
        if (t && typeof t.name === 'string') {
          tagMap.set(t.name, {
            name: t.name,
            description: t.description as string | undefined,
            externalDocs: this.normalizeExternalDocs(t.externalDocs)
          })
        }
      }
    }

    // 4. Security Schemes & Global Security
    const componentsRaw = (rawDoc.components as Record<string, unknown>) || {}
    const rawSecuritySchemes = (componentsRaw.securitySchemes as Record<string, Record<string, unknown>>) ||
      (rawDoc.securityDefinitions as Record<string, Record<string, unknown>>) || {}

    const securitySchemes: Record<string, SecurityScheme> = {}
    for (const [schemeKey, schemeObj] of Object.entries(rawSecuritySchemes)) {
      if (schemeObj && typeof schemeObj === 'object') {
        const resolved = this.resolveRef<Record<string, unknown>>(rawDoc, schemeObj)
        securitySchemes[schemeKey] = {
          type: (resolved.type as string) || 'apiKey',
          description: resolved.description as string | undefined,
          name: resolved.name as string | undefined,
          in: resolved.in as string | undefined,
          scheme: resolved.scheme as string | undefined,
          bearerFormat: resolved.bearerFormat as string | undefined,
          flows: resolved.flows as Record<string, unknown> | undefined,
          openIdConnectUrl: resolved.openIdConnectUrl as string | undefined
        }
      }
    }

    const globalSecurity: SecurityRequirement[] = []
    if (Array.isArray(rawDoc.security)) {
      for (const secItem of rawDoc.security as SecurityRequirement[]) {
        if (secItem && typeof secItem === 'object') {
          globalSecurity.push(secItem)
        }
      }
    }

    // 5. Schemas & Components Dictionary
    const rawSchemas = (componentsRaw.schemas as Record<string, SchemaObject>) ||
      (rawDoc.definitions as Record<string, SchemaObject>) || {}

    const components: ComponentsObject = {
      schemas: rawSchemas,
      securitySchemes,
      responses: componentsRaw.responses as ComponentsObject['responses'],
      parameters: componentsRaw.parameters as ComponentsObject['parameters'],
      requestBodies: componentsRaw.requestBodies as ComponentsObject['requestBodies'],
      headers: componentsRaw.headers as ComponentsObject['headers'],
      examples: componentsRaw.examples as ComponentsObject['examples']
    }

    // 6. Paths & Endpoints Extraction (with full $ref resolution & path parameter inheritance)
    const endpoints: EndpointOperation[] = []
    const paths = (rawDoc.paths as Record<string, Record<string, unknown>>) || {}
    const supportedMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const

    for (const [pathKey, pathObjRaw] of Object.entries(paths)) {
      if (!pathObjRaw || typeof pathObjRaw !== 'object') continue
      const pathObj = this.resolveRef<Record<string, unknown>>(rawDoc, pathObjRaw)

      // Path-level parameters
      const pathLevelParams: ParameterItem[] = []
      if (Array.isArray(pathObj.parameters)) {
        for (const pRaw of pathObj.parameters as Array<Record<string, unknown>>) {
          const resolvedP = this.resolveRef<Record<string, unknown>>(rawDoc, pRaw)
          if (resolvedP && typeof resolvedP.name === 'string' && typeof resolvedP.in === 'string') {
            pathLevelParams.push(this.normalizeParameter(resolvedP))
          }
        }
      }

      for (const method of supportedMethods) {
        const operationRaw = pathObj[method] as Record<string, unknown> | undefined
        if (!operationRaw || typeof operationRaw !== 'object') continue

        const operation = this.resolveRef<Record<string, unknown>>(rawDoc, operationRaw)

        const summary = (operation.summary as string) || ''
        const opDescription = (operation.description as string) || ''
        const deprecated = Boolean(operation.deprecated)
        const opExternalDocs = this.normalizeExternalDocs(operation.externalDocs)

        const rawTags = Array.isArray(operation.tags) ? (operation.tags as string[]) : ['Default']
        rawTags.forEach((tName) => {
          if (!tagMap.has(tName)) {
            tagMap.set(tName, { name: tName })
          }
        })

        // Merge Operation Parameters with Path-level Parameters (Operation overrides Path)
        const opParamsMap = new Map<string, ParameterItem>()
        for (const p of pathLevelParams) {
          opParamsMap.set(`${p.in}:${p.name}`, p)
        }

        // Swagger v2 `formData` / `body` parameter conversion fallback
        let v2FormDataBody: RequestBodySchema | undefined

        if (Array.isArray(operation.parameters)) {
          for (const pRaw of operation.parameters as Array<Record<string, unknown>>) {
            const resolvedP = this.resolveRef<Record<string, unknown>>(rawDoc, pRaw)
            if (resolvedP && typeof resolvedP.name === 'string' && typeof resolvedP.in === 'string') {
              if (resolvedP.in === 'body') {
                v2FormDataBody = {
                  description: resolvedP.description as string | undefined,
                  required: Boolean(resolvedP.required),
                  content: {
                    'application/json': {
                      schema: resolvedP.schema as SchemaObject
                    }
                  }
                }
              } else if (resolvedP.in === 'formData') {
                v2FormDataBody = v2FormDataBody || {
                  description: 'Form Data Payload',
                  content: {
                    'application/x-www-form-urlencoded': {
                      schema: { type: 'object', properties: {} }
                    }
                  }
                }
                const formProps = (v2FormDataBody.content!['application/x-www-form-urlencoded'].schema!.properties!)
                formProps[resolvedP.name as string] = {
                  type: (resolvedP.type as string) || 'string',
                  description: resolvedP.description as string
                }
              } else {
                const normalized = this.normalizeParameter(resolvedP)
                opParamsMap.set(`${normalized.in}:${normalized.name}`, normalized)
              }
            }
          }
        }

        const mergedParameters = Array.from(opParamsMap.values())

        // Extract Request Body (OpenAPI v3 or Swagger v2 fallback)
        let requestBody: RequestBodySchema | undefined
        if (operation.requestBody && typeof operation.requestBody === 'object') {
          const rbResolved = this.resolveRef<Record<string, unknown>>(rawDoc, operation.requestBody as Record<string, unknown>)
          requestBody = {
            description: rbResolved.description as string | undefined,
            required: Boolean(rbResolved.required),
            content: this.normalizeContent(rawDoc, rbResolved.content as Record<string, unknown>)
          }
        } else if (v2FormDataBody) {
          requestBody = v2FormDataBody
        }

        // Extract Responses & Headers
        const responses: ResponseItem[] = []
        if (operation.responses && typeof operation.responses === 'object') {
          for (const [statusCode, respObjRaw] of Object.entries(operation.responses as Record<string, Record<string, unknown>>)) {
            const respObj = this.resolveRef<Record<string, unknown>>(rawDoc, respObjRaw)

            const headers: Record<string, HeaderObject> = {}
            if (respObj.headers && typeof respObj.headers === 'object') {
              for (const [hName, hObjRaw] of Object.entries(respObj.headers as Record<string, Record<string, unknown>>)) {
                const hObj = this.resolveRef<Record<string, unknown>>(rawDoc, hObjRaw)
                headers[hName] = {
                  description: hObj.description as string | undefined,
                  required: Boolean(hObj.required),
                  deprecated: Boolean(hObj.deprecated),
                  schema: hObj.schema as SchemaObject,
                  example: hObj.example
                }
              }
            }

            responses.push({
              statusCode,
              description: (respObj.description as string) || '',
              headers: Object.keys(headers).length > 0 ? headers : undefined,
              content: this.normalizeContent(rawDoc, respObj.content as Record<string, unknown>)
            })
          }
        }

        // Extract Operation-level Security Overrides
        let opSecurity: SecurityRequirement[] | undefined
        if (Array.isArray(operation.security)) {
          opSecurity = operation.security as SecurityRequirement[]
        }

        // Extract Operation-level Servers Overrides
        let opServers: ServerItem[] | undefined
        if (Array.isArray(operation.servers)) {
          opServers = (operation.servers as Array<Record<string, unknown>>)
            .filter((s) => s && typeof s.url === 'string')
            .map((s) => ({ url: s.url as string, description: s.description as string | undefined }))
        }

        const opId = (operation.operationId as string) || `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, '_')}`

        const rawJose = operation['x-jose-security'] ?? pathObj['x-jose-security'] ?? rawDoc['x-jose-security']
        const joseSecurity = this.normalizeJoseSecurity(rawJose)

        // Ensure required JOSE headers are explicitly included in endpoint.parameters
        const finalParameters = [...mergedParameters]
        if (joseSecurity && joseSecurity.enabled !== false) {
          if (joseSecurity.sign && joseSecurity.sign.placement !== 'body') {
            const hName = joseSecurity.sign.headerName || 'X-Signature'
            const exists = finalParameters.some((p) => p.in === 'header' && p.name.toLowerCase() === hName.toLowerCase())
            if (!exists) {
              finalParameters.unshift({
                name: hName,
                in: 'header',
                required: true,
                description: `Required JOSE ${joseSecurity.mode?.toUpperCase()} digital signature (${joseSecurity.sign.alg}) automatically computed on send`,
                schema: { type: 'string', format: 'jws' }
              })
            }
          }
          if (joseSecurity.encrypt && joseSecurity.encrypt.placement === 'header') {
            const hName = joseSecurity.encrypt.headerName || 'X-Encrypted-Payload'
            const exists = finalParameters.some((p) => p.in === 'header' && p.name.toLowerCase() === hName.toLowerCase())
            if (!exists) {
              finalParameters.unshift({
                name: hName,
                in: 'header',
                required: true,
                description: `Required JOSE JWE encrypted payload (${joseSecurity.encrypt.alg}/${joseSecurity.encrypt.enc}) automatically computed on send`,
                schema: { type: 'string', format: 'jwe' }
              })
            }
          }

          if (joseSecurity.computeDigest) {
            const digestHdr = joseSecurity.digestHeaderName || 'Digest'
            const exists = finalParameters.some((p) => p.in === 'header' && p.name.toLowerCase() === digestHdr.toLowerCase())
            if (!exists) {
              finalParameters.unshift({
                name: digestHdr,
                in: 'header',
                required: true,
                description: `HTTP Content Digest: ${joseSecurity.digestAlgorithm || 'SHA-256'}=<base64-hash> automatically computed over request payload`,
                schema: { type: 'string' }
              })
            }
          }
        }

        endpoints.push({
          id: opId,
          method,
          path: pathKey,
          summary,
          description: opDescription,
          tags: rawTags,
          parameters: finalParameters,
          requestBody,
          responses,
          security: opSecurity,
          servers: opServers,
          deprecated,
          externalDocs: opExternalDocs,
          joseSecurity
        })
      }
    }

    const calculatedId = specId || info.title.toLowerCase().replace(/[^a-z0-9]/g, '-')

    return {
      id: calculatedId,
      info,
      title: info.title,
      version: info.version,
      description: info.description,
      servers,
      endpoints,
      tags: Array.from(tagMap.values()),
      securitySchemes,
      globalSecurity,
      components,
      schemas: rawSchemas,
      externalDocs,
      rawYaml: yamlContent,
      createdAt: new Date().toISOString()
    }
  }

  /**
   * Recursively resolves internal JSON Pointers ($ref: '#/components/...')
   */
  private resolveRef<T extends Record<string, unknown>>(rootDoc: Record<string, unknown>, target: unknown, visited = new Set<string>()): T {
    if (!target || typeof target !== 'object') {
      return target as T
    }

    const targetObj = target as Record<string, unknown>
    if (typeof targetObj.$ref === 'string') {
      const refPath = targetObj.$ref
      if (visited.has(refPath)) {
        // Prevent circular reference infinite loops
        return targetObj as T
      }
      visited.add(refPath)

      if (refPath.startsWith('#/')) {
        const parts = refPath.substring(2).split('/')
        let current: unknown = rootDoc

        for (const part of parts) {
          const decoded = decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))
          if (current && typeof current === 'object' && decoded in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[decoded]
          } else {
            current = undefined;
            break
          }
        }

        if (current && typeof current === 'object') {
          // Merge siblings if any other properties exist beside $ref
          const restObj = { ...targetObj }
          delete restObj.$ref
          const resolved = this.resolveRef<T>(rootDoc, current, visited)
          return { ...resolved, ...restObj }
        }
      }
    }

    return targetObj as T
  }

  private normalizeParameter(p: Record<string, unknown>): ParameterItem {
    return {
      name: p.name as string,
      in: p.in as ParameterItem['in'],
      description: p.description as string | undefined,
      required: Boolean(p.required),
      deprecated: Boolean(p.deprecated),
      allowEmptyValue: Boolean(p.allowEmptyValue),
      style: p.style as string | undefined,
      explode: p.explode !== undefined ? Boolean(p.explode) : undefined,
      schema: p.schema as SchemaObject | undefined,
      example: p.example,
      examples: p.examples as ParameterItem['examples']
    }
  }

  private normalizeContent(rootDoc: Record<string, unknown>, contentRaw?: Record<string, unknown>): Record<string, MediaTypeObject> | undefined {
    if (!contentRaw || typeof contentRaw !== 'object') {
      return undefined
    }

    const contentMap: Record<string, MediaTypeObject> = {}
    for (const [mediaType, mediaObjRaw] of Object.entries(contentRaw)) {
      if (mediaObjRaw && typeof mediaObjRaw === 'object') {
        const mediaObj = this.resolveRef<Record<string, unknown>>(rootDoc, mediaObjRaw)
        const schemaObj = mediaObj.schema ? this.resolveRef<Record<string, unknown>>(rootDoc, mediaObj.schema) : undefined
        contentMap[mediaType] = {
          schema: schemaObj as SchemaObject | undefined,
          example: mediaObj.example,
          examples: mediaObj.examples as MediaTypeObject['examples']
        }
      }
    }

    return Object.keys(contentMap).length > 0 ? contentMap : undefined
  }

  private normalizeExternalDocs(extDocsRaw?: unknown): ExternalDocumentation | undefined {
    if (extDocsRaw && typeof extDocsRaw === 'object') {
      const docs = extDocsRaw as Record<string, string>
      if (typeof docs.url === 'string') {
        return {
          description: docs.description,
          url: docs.url
        }
      }
    }
    return undefined
  }

  /**
   * Normalizes x-jose-security vendor extension with smart defaults (kid is strictly optional)
   */
  private normalizeJoseSecurity(raw: unknown): JoseSecurityExtension | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined
    }

    const obj = raw as Record<string, unknown>
    if (obj.enabled === false) {
      return undefined
    }

    let signConfig: JoseSignatureConfig | undefined
    let encryptConfig: JoseEncryptionConfig | undefined

    // 1. Check sign block or shorthand alg
    const rawSign = obj.sign as Record<string, unknown> | undefined
    if (rawSign && typeof rawSign === 'object' && typeof rawSign.alg === 'string') {
      const signPlacement = rawSign.placement === 'body' ? 'body' : rawSign.placement === 'field' ? 'field' : 'header'
      signConfig = {
        alg: rawSign.alg,
        kid: typeof rawSign.kid === 'string' ? rawSign.kid : undefined,
        headerName: typeof rawSign.headerName === 'string' ? rawSign.headerName : 'X-Signature',
        placement: signPlacement,
        detached: Boolean(rawSign.detached),
        includeIat: Boolean(rawSign.includeIat),
        includeJti: Boolean(rawSign.includeJti),
        crit: Array.isArray(rawSign.crit) ? (rawSign.crit.filter((c) => typeof c === 'string') as string[]) : undefined,
        b64: typeof rawSign.b64 === 'boolean' ? rawSign.b64 : undefined,
        customHeaders: typeof rawSign.customHeaders === 'object' && rawSign.customHeaders !== null ? (rawSign.customHeaders as Record<string, unknown>) : undefined,
        x5t: Boolean(rawSign.x5t),
        x5c: Boolean(rawSign.x5c),
        digestInPayload: Boolean(rawSign.digestInPayload || obj.digestInPayload),
        digestClaimName: typeof rawSign.digestClaimName === 'string' ? rawSign.digestClaimName : (typeof obj.digestClaimName === 'string' ? obj.digestClaimName : undefined),
        digestAlgorithm: rawSign.digestAlgorithm === 'SHA-512' || rawSign.digestAlgorithm === 'SHA-384' ? rawSign.digestAlgorithm : (obj.digestAlgorithm === 'SHA-512' || obj.digestAlgorithm === 'SHA-384' ? obj.digestAlgorithm : 'SHA-256'),
        claims: typeof rawSign.claims === 'object' && rawSign.claims !== null ? (rawSign.claims as Record<string, unknown>) : (typeof obj.claims === 'object' && obj.claims !== null ? (obj.claims as Record<string, unknown>) : undefined)
      }
    } else if (typeof obj.alg === 'string' && !obj.encrypt) {
      // Shorthand x-jose-security: { alg: "RS256", kid: "..." }
      signConfig = {
        alg: obj.alg as string,
        kid: typeof obj.kid === 'string' ? (obj.kid as string) : undefined,
        headerName: typeof obj.headerName === 'string' ? (obj.headerName as string) : 'X-Signature',
        placement: obj.placement === 'body' ? 'body' : obj.placement === 'field' ? 'field' : 'header',
        detached: Boolean(obj.detached),
        includeIat: Boolean(obj.includeIat),
        includeJti: Boolean(obj.includeJti),
        crit: Array.isArray(obj.crit) ? (obj.crit.filter((c) => typeof c === 'string') as string[]) : undefined,
        b64: typeof obj.b64 === 'boolean' ? obj.b64 : undefined,
        x5t: Boolean(obj.x5t),
        x5c: Boolean(obj.x5c),
        digestInPayload: Boolean(obj.digestInPayload),
        digestClaimName: typeof obj.digestClaimName === 'string' ? obj.digestClaimName : undefined,
        digestAlgorithm: obj.digestAlgorithm === 'SHA-512' || obj.digestAlgorithm === 'SHA-384' ? obj.digestAlgorithm : 'SHA-256',
        claims: typeof obj.claims === 'object' && obj.claims !== null ? (obj.claims as Record<string, unknown>) : undefined
      }
    }

    // 2. Check encrypt block
    const rawEncrypt = obj.encrypt as Record<string, unknown> | undefined
    if (rawEncrypt && typeof rawEncrypt === 'object' && typeof rawEncrypt.alg === 'string' && typeof rawEncrypt.enc === 'string') {
      const targetField = typeof rawEncrypt.targetField === 'string' ? rawEncrypt.targetField : (rawEncrypt.fields ? 'encData' : undefined)
      const fields = Array.isArray(rawEncrypt.fields) ? (rawEncrypt.fields.filter((f) => typeof f === 'string') as string[]) : undefined

      let encPlacement: 'header' | 'body' | 'field' = 'body'
      if (rawEncrypt.placement === 'header') {
        encPlacement = 'header'
      } else if (rawEncrypt.placement === 'field' || targetField || fields) {
        encPlacement = 'field'
      }

      encryptConfig = {
        alg: rawEncrypt.alg,
        enc: rawEncrypt.enc,
        kid: typeof rawEncrypt.kid === 'string' ? rawEncrypt.kid : undefined,
        headerName: typeof rawEncrypt.headerName === 'string' ? rawEncrypt.headerName : 'X-Encrypted-Payload',
        placement: encPlacement,
        targetField: targetField || (encPlacement === 'field' ? 'encData' : undefined),
        fields,
        cty: typeof rawEncrypt.cty === 'string' ? rawEncrypt.cty : undefined,
        zip: rawEncrypt.zip === 'DEF' ? 'DEF' : undefined,
        x5t: Boolean(rawEncrypt.x5t),
        x5c: Boolean(rawEncrypt.x5c),
        customHeaders: typeof rawEncrypt.customHeaders === 'object' && rawEncrypt.customHeaders !== null
          ? (rawEncrypt.customHeaders as Record<string, unknown>)
          : undefined,
        crit: Array.isArray(rawEncrypt.crit)
          ? (rawEncrypt.crit.filter((c) => typeof c === 'string') as string[])
          : undefined,
        claims: typeof rawEncrypt.claims === 'object' && rawEncrypt.claims !== null
          ? (rawEncrypt.claims as Record<string, unknown>)
          : undefined
      }
    }

    if (!signConfig && !encryptConfig) {
      return undefined
    }

    // 3. Determine Mode
    let mode: 'jws' | 'jwe' | 'both'
    if (signConfig && encryptConfig) {
      mode = 'both'
    } else if (encryptConfig) {
      mode = 'jwe'
    } else {
      mode = 'jws'
    }

    if (obj.mode === 'jws' || obj.mode === 'jwe' || obj.mode === 'both') {
      mode = obj.mode
    }

    if (mode === 'jwe' && encryptConfig && !encryptConfig.claims && typeof obj.claims === 'object' && obj.claims !== null) {
      encryptConfig.claims = obj.claims as Record<string, unknown>
    }

    const digestHdr = typeof obj.digestHeaderName === 'string' && obj.digestHeaderName.trim() ? obj.digestHeaderName.trim() : 'Digest'
    const digestAlg = obj.digestAlgorithm === 'SHA-512' || obj.digestAlgorithm === 'SHA-384' ? obj.digestAlgorithm : (signConfig?.digestAlgorithm || 'SHA-256')

    return {
      enabled: true,
      mode,
      sign: signConfig,
      encrypt: encryptConfig,
      computeDigest: Boolean(obj.computeDigest),
      digestHeaderName: digestHdr,
      digestAlgorithm: digestAlg,
      digestInPayload: Boolean(obj.digestInPayload || signConfig?.digestInPayload),
      digestClaimName: typeof obj.digestClaimName === 'string' ? obj.digestClaimName : signConfig?.digestClaimName,
      claims: signConfig?.claims || (typeof obj.claims === 'object' && obj.claims !== null ? (obj.claims as Record<string, unknown>) : undefined),
      jwksUri: typeof obj.jwksUri === 'string' ? obj.jwksUri : undefined,
      verifyResponse: Boolean(obj.verifyResponse),
      decryptResponse: Boolean(obj.decryptResponse)
    }
  }

  /**
   * Helper to filter endpoints that require JOSE security
   */
  public static getEndpointsWithJose(doc: OpenApiDocument): EndpointOperation[] {
    return doc.endpoints.filter((ep) => ep.joseSecurity && ep.joseSecurity.enabled !== false)
  }
}

