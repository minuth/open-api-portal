// 100% OpenAPI 3.0 / 3.1 & Swagger 2.0 Compliant Domain Types
import { JoseSecurityExtension } from './jose'

export interface ExternalDocumentation {
  description?: string
  url: string
}

export interface ContactObject {
  name?: string
  url?: string
  email?: string
}

export interface LicenseObject {
  name: string
  url?: string
}

export interface InfoObject {
  title: string
  version: string
  description?: string
  termsOfService?: string
  contact?: ContactObject
  license?: LicenseObject
}

export interface ServerVariable {
  default: string
  enum?: string[]
  description?: string
}

export interface ServerItem {
  url: string
  description?: string
  variables?: Record<string, ServerVariable>
}

export interface SchemaObject {
  type?: string
  format?: string
  title?: string
  description?: string
  default?: unknown
  example?: unknown
  examples?: unknown[]
  enum?: unknown[]
  required?: string[]
  properties?: Record<string, SchemaObject>
  items?: SchemaObject
  allOf?: SchemaObject[]
  oneOf?: SchemaObject[]
  anyOf?: SchemaObject[]
  not?: SchemaObject
  additionalProperties?: boolean | SchemaObject
  nullable?: boolean
  readOnly?: boolean
  writeOnly?: boolean
  deprecated?: boolean
  $ref?: string
}

export interface ParameterItem {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie'
  description?: string
  required?: boolean
  deprecated?: boolean
  allowEmptyValue?: boolean
  style?: string
  explode?: boolean
  schema?: SchemaObject
  example?: unknown
  examples?: Record<string, { value: unknown; summary?: string }>
}

export interface HeaderObject {
  description?: string
  required?: boolean
  deprecated?: boolean
  schema?: SchemaObject
  example?: unknown
}

export interface MediaTypeObject {
  schema?: SchemaObject
  example?: unknown
  examples?: Record<string, { value: unknown; summary?: string }>
}

export interface RequestBodySchema {
  description?: string
  required?: boolean
  content?: Record<string, MediaTypeObject>
}

export interface ResponseItem {
  statusCode: string
  description: string
  headers?: Record<string, HeaderObject>
  content?: Record<string, MediaTypeObject>
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | string
  description?: string
  name?: string
  in?: 'query' | 'header' | 'cookie' | string
  scheme?: string
  bearerFormat?: string
  flows?: Record<string, unknown>
  openIdConnectUrl?: string
}

export interface SecurityRequirement {
  [schemeName: string]: string[]
}

export interface TagObject {
  name: string
  description?: string
  externalDocs?: ExternalDocumentation
}

export interface EndpointOperation {
  id: string
  method: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head'
  path: string
  summary?: string
  description?: string
  tags: string[]
  parameters: ParameterItem[]
  requestBody?: RequestBodySchema
  responses: ResponseItem[]
  security?: SecurityRequirement[]
  servers?: ServerItem[]
  deprecated?: boolean
  externalDocs?: ExternalDocumentation
  joseSecurity?: JoseSecurityExtension
}

export interface ComponentsObject {
  schemas?: Record<string, SchemaObject>
  responses?: Record<string, ResponseItem>
  parameters?: Record<string, ParameterItem>
  examples?: Record<string, unknown>
  requestBodies?: Record<string, RequestBodySchema>
  headers?: Record<string, HeaderObject>
  securitySchemes?: Record<string, SecurityScheme>
}

export interface OpenApiDocument {
  id: string
  info: InfoObject
  title: string
  version: string
  description?: string
  servers: ServerItem[]
  endpoints: EndpointOperation[]
  tags: TagObject[]
  securitySchemes?: Record<string, SecurityScheme>
  globalSecurity?: SecurityRequirement[]
  components?: ComponentsObject
  schemas?: Record<string, SchemaObject>
  externalDocs?: ExternalDocumentation
  rawYaml: string
  isTemporary?: boolean
  userId?: string
  createdAt: string
}

// Summary item for catalog listing
export interface SpecSummary {
  id: string
  title: string
  version: string
  description?: string
  endpointCount: number
  isTemporary?: boolean
  userId?: string
  createdAt: string
}

// SOLID Interface Contracts
export interface ISpecReader {
  getSpec(id: string, userId?: string): Promise<OpenApiDocument | null>
  listSpecs(userId?: string): Promise<SpecSummary[]>
}

export interface ISpecWriter {
  saveSpec(filename: string, yamlContent: string, userId?: string): Promise<OpenApiDocument>
  deleteSpec(id: string, userId?: string): Promise<boolean>
}

export interface IStorageProvider extends ISpecReader, ISpecWriter {}

export interface ISpecParser {
  parseYaml(yamlContent: string, specId?: string, filename?: string): Promise<OpenApiDocument>
}

export interface ProxyRequestParams {
  targetUrl: string
  method: string
  headers?: Record<string, string>
  queryParams?: Record<string, string>
  body?: string
}

export interface ProxyResponseResult {
  statusCode: number
  statusText: string
  headers: Record<string, string>
  body: string
  latencyMs: number
  contentType: string
}

export interface ActualRequestData {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  rawHttp: string
  curlCommand: string
}

export interface IProxyDispatcher {
  execute(params: ProxyRequestParams): Promise<ProxyResponseResult>
}
