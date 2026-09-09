// Domain types for OpenAPI Security Schemes & Playground Auth Handlers

export type AuthType =
  | 'none'
  | 'inherit'
  | 'bearer'
  | 'apiKey'
  | 'basic'
  | 'oauth2'
  | 'openIdConnect'
  | 'custom'

export type ApiKeyPlacement = 'header' | 'query' | 'cookie'

export interface ClientAuthConfig {
  type: AuthType
  schemeName?: string // Name of the securityScheme from the OpenAPI spec
  inherit?: boolean // Whether to inherit credentials from global spec auth

  // Bearer & OAuth2 / OIDC
  token?: string
  bearerPrefix?: string // Defaults to 'Bearer'

  // API Key
  apiKeyName?: string
  apiKeyValue?: string
  apiKeyPlacement?: ApiKeyPlacement

  // Basic Auth
  username?: string
  password?: string

  // Custom Header
  customHeaderName?: string
  customHeaderValue?: string

  // Scopes (OAuth2 / OIDC)
  scopes?: string[]
}

export interface ResolvedSecuritySchemeInfo {
  name: string
  type: AuthType
  specType: string
  description?: string
  keyName?: string // For apiKey (e.g. X-API-KEY)
  placement?: ApiKeyPlacement
  scheme?: string // For http (e.g. bearer, basic)
  bearerFormat?: string
  flows?: Record<string, unknown>
  openIdConnectUrl?: string
  scopes?: string[] // Declared required scopes for this operation
}

export interface ParsedJwtInfo {
  valid: boolean
  header: Record<string, unknown>
  payload: Record<string, unknown>
  sub?: string
  iss?: string
  aud?: string
  exp?: number
  iat?: number
  isExpired?: boolean
  expiresIn?: string
  rawHeader: string
  rawPayload: string
}
