// Domain types for x-jose-security OpenAPI extension and in-memory cryptographic pipeline

export type JoseOperationMode = 'jws' | 'jwe' | 'both'
export type JoseTargetPlacement = 'header' | 'body' | 'field'
export type JoseValueType = 'text' | 'boolean' | 'date' | 'datetime' | 'unix' | 'uuid'

export interface JoseTypedValueDescriptor {
  type?: JoseValueType
  value?: unknown
  autoNow?: boolean
  required?: boolean
}

export interface JoseSignatureConfig {
  alg: string
  kid?: string
  headerName?: string // Defaults to 'X-Signature' if placement is 'header'
  placement?: JoseTargetPlacement // Defaults to 'header'
  detached?: boolean // Whether payload is detached in header
  includeIat?: boolean // Injects 'iat' (issued-at) timestamp claim into protected header (FAPI / Open Banking)
  includeJti?: boolean // Injects 'jti' (JWT ID / UUID nonce) into protected header
  crit?: string[] // Critical headers list per RFC 7515 §4.1.11
  b64?: boolean // Unencoded payload option per RFC 7797
  customHeaders?: Record<string, unknown> // Custom FAPI / Open Banking protected header claims
  x5t?: boolean // Automatically computes and sets 'x5t#S256' certificate thumbprint
  x5c?: boolean // Embeds X.509 certificate chain in 'x5c'
  digestInPayload?: boolean // Injects body digest claim into JWS token payload (e.g. PolishAPI / SPID / eIDAS)
  digestClaimName?: string // Claim key name for the digest (default: 'digest')
  digestAlgorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512' // Algorithm for payload digest
  claims?: Record<string, unknown> // Additional custom JWT payload claims (e.g. iss, aud, sub, scope)
  defaultKey?: string // Default private/secret key text (PEM, JWK, or secret) from specification
  defaultPassphrase?: string // Optional default passphrase for encrypted private keys
}

export interface JoseEncryptionConfig {
  alg: string // e.g. RSA-OAEP-256, A256KW, ECDH-ES+A256KW, dir
  enc: string // e.g. A256GCM, A128CBC-HS256
  kid?: string
  headerName?: string // Defaults to 'X-Encrypted-Payload' if placement is 'header'
  placement?: JoseTargetPlacement // Defaults to 'body', or 'field' if targetField/fields present
  targetField?: string // Field to store JWE token when placement is 'field' (default: 'encData')
  fields?: string[] // Sensitive fields to extract and encrypt into targetField
  cty?: string // Explicit Content Type in JWE protected header ('JWT' or 'json' per RFC 7516 §4.1.10)
  zip?: 'DEF' // Deflate compression per RFC 7516 §4.1.3
  x5t?: boolean // Sets 'x5t#S256' on JWE protected header
  x5c?: boolean // Embeds certificate chain on JWE protected header
  customHeaders?: Record<string, unknown>
  crit?: string[]
  claims?: Record<string, unknown> // Custom payload claims for Encrypted JWT (RFC 7519)
  defaultKey?: string // Default recipient public/secret key text (PEM, JWK, or secret) from specification
}

export interface JoseSecurityExtension {
  enabled?: boolean
  mode?: JoseOperationMode
  sign?: JoseSignatureConfig
  encrypt?: JoseEncryptionConfig
  computeDigest?: boolean // Automatically computes RFC 3230 'Digest: SHA-256=...' before signing
  digestHeaderName?: string // Custom HTTP header name for digest (default: 'Digest', e.g. 'Content-Digest')
  digestAlgorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512' // Hash algorithm for Digest header or payload
  digestInPayload?: boolean // Injects body digest claim into JWS token payload
  digestClaimName?: string // Claim key name for the digest (default: 'digest')
  claims?: Record<string, unknown> // Additional custom JWT payload claims
  jwksUri?: string // Remote JWKS discovery endpoint for public keys
  verifyResponse?: boolean // Verifies incoming JWS responses
  decryptResponse?: boolean // Decrypts incoming JWE responses
  defaultKey?: string // Top-level default key text from specification
  defaultSigningKey?: string // Top-level default signing key text from specification
  defaultEncryptionKey?: string // Top-level default encryption key text from specification
}

export interface EphemeralKeyInput {
  keyContent: string
  kid?: string
  format?: 'pem' | 'jwk' | 'der'
  passphrase?: string
  certificateContent?: string // Optional companion X.509 certificate for x5t#S256 / x5c
  // Dual-key support for mode: 'both'
  signingKeyContent?: string // Client Private Key for JWS
  signingKid?: string
  signingPassphrase?: string
  encryptionKeyContent?: string // Recipient Public Key for JWE
  encryptionKid?: string
}

export interface JoseTransformMeta {
  mode: JoseOperationMode
  alg: string
  enc?: string
  kid?: string
  tokenPreview?: string
  placement: JoseTargetPlacement
  headerName?: string
  targetField?: string
  encryptedFields?: string[]
  flePattern?: 'pure' | 'outer-signature' | 'nested'
  cty?: string
  crit?: string[]
  zip?: string
  digest?: string
  digestHeaderName?: string
  payloadClaims?: Record<string, unknown>
  encClaims?: Record<string, unknown>
  x5t?: string
  x5c?: string[]
}

export interface JoseResponseMeta {
  decrypted?: boolean
  verified?: boolean
  alg?: string
  enc?: string
  rawEncryptedBody?: string
  claims?: Record<string, unknown>
}

export interface JoseTransformResult {
  headers: Record<string, string>
  body?: string
  meta?: JoseTransformMeta
}

export interface IJoseEngine {
  signPayload(payload: string, config: JoseSignatureConfig, key: EphemeralKeyInput): Promise<string>
  encryptPayload(payload: string, config: JoseEncryptionConfig, key: EphemeralKeyInput): Promise<string>
  processOutgoingRequest(
    rawBody: string | undefined,
    headers: Record<string, string>,
    config: JoseSecurityExtension,
    key?: EphemeralKeyInput
  ): Promise<JoseTransformResult>
  processIncomingResponse(
    rawBody: string,
    headers: Record<string, string>,
    config: JoseSecurityExtension,
    key?: EphemeralKeyInput
  ): Promise<{ body: string; headers: Record<string, string>; meta?: JoseResponseMeta }>
}
