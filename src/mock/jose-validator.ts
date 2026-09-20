import crypto from 'node:crypto'
import * as jose from 'jose'

export class JoseValidationError extends Error {
  public statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'JoseValidationError'
    this.statusCode = statusCode
  }
}

/**
 * Validates an attached compact JWS token (header.payload.signature)
 */
export async function verifyAttachedJws(
  token: string,
  key: jose.CryptoKey | Uint8Array,
  expectedAlg?: string,
  options?: { crit?: Record<string, boolean> }
): Promise<{ header: jose.CompactJWSHeaderParameters; payload: string; claims: Record<string, unknown> }> {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new JoseValidationError('Missing JWS token', 400)
  }

  try {
    const result = await jose.compactVerify(trimmed, key, options)
    const header = result.protectedHeader
    if (expectedAlg && header.alg !== expectedAlg) {
      throw new JoseValidationError(`Expected JWS algorithm '${expectedAlg}', got '${header.alg}'`, 400)
    }

    const payload = new TextDecoder().decode(result.payload)
    let claims: Record<string, unknown> = {}
    try {
      claims = JSON.parse(payload) as Record<string, unknown>
    } catch {
      claims = { raw: payload }
    }

    return { header, payload, claims }
  } catch (err: unknown) {
    if (err instanceof JoseValidationError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    throw new JoseValidationError(`JWS signature verification failed: ${msg}`, 401)
  }
}

/**
 * Validates a detached JWS token (header..signature) against the raw request body
 */
export async function verifyDetachedJws(
  detachedToken: string,
  rawBody: string,
  key: jose.CryptoKey | Uint8Array,
  expectedAlg?: string
): Promise<{ header: jose.CompactJWSHeaderParameters }> {
  const trimmed = detachedToken.trim()
  const parts = trimmed.split('.')
  if (parts.length !== 3 || parts[1] !== '') {
    throw new JoseValidationError("Invalid detached JWS format. Expected 'header..signature'", 400)
  }

  // Reconstruct full JWS by base64url encoding raw body
  const payloadB64 = Buffer.from(rawBody, 'utf-8').toString('base64url')
  const reconstructedJws = `${parts[0]}.${payloadB64}.${parts[2]}`

  try {
    const result = await jose.compactVerify(reconstructedJws, key)
    const header = result.protectedHeader
    if (expectedAlg && header.alg !== expectedAlg) {
      throw new JoseValidationError(`Expected JWS algorithm '${expectedAlg}', got '${header.alg}'`, 400)
    }
    return { header }
  } catch (err: unknown) {
    if (err instanceof JoseValidationError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    throw new JoseValidationError(`Detached JWS signature verification failed: ${msg}`, 401)
  }
}

/**
 * Validates RFC 3230 / RFC 5843 / RFC 9530 HTTP Digest header (e.g. SHA-256=<base64-hash>)
 */
export function verifyDigestHeader(
  digestHeader: string | undefined,
  rawBody: string,
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256',
  headerName = 'Digest'
): void {
  if (!digestHeader) {
    throw new JoseValidationError(`Missing required '${headerName}' header`, 400)
  }

  let hashAlg = 'sha256'
  if (algorithm === 'SHA-512') hashAlg = 'sha512'
  else if (algorithm === 'SHA-384') hashAlg = 'sha384'
  const expectedHash = crypto.createHash(hashAlg).update(rawBody, 'utf8').digest('base64')
  const expectedHeader = `${algorithm}=${expectedHash}`

  if (digestHeader.trim() !== expectedHeader) {
    throw new JoseValidationError(
      `Digest header mismatch. Expected '${expectedHeader}', received '${digestHeader.trim()}'`,
      400
    )
  }
}

/**
 * Validates that a JWS claims set contains a valid digest of the HTTP body
 */
export function verifyPayloadDigest(
  claims: Record<string, unknown>,
  rawBody: string,
  claimName = 'digest',
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256'
): void {
  const claimValue = claims[claimName]
  if (typeof claimValue !== 'string') {
    throw new JoseValidationError(`Missing '${claimName}' claim in JWS payload`, 400)
  }

  let hashAlg = 'sha256'
  if (algorithm === 'SHA-512') hashAlg = 'sha512'
  else if (algorithm === 'SHA-384') hashAlg = 'sha384'
  const expectedHash = crypto.createHash(hashAlg).update(rawBody, 'utf8').digest('base64')
  const expectedClaim = `${algorithm}=${expectedHash}`

  if (claimValue.trim() !== expectedClaim) {
    throw new JoseValidationError(
      `JWS payload digest claim mismatch. Expected '${expectedClaim}', received '${claimValue.trim()}'`,
      400
    )
  }
}

/**
 * Decrypts a 5-part compact JWE token (header.encryptedKey.iv.ciphertext.tag)
 */
export async function decryptCompactJwe(
  token: string,
  key: jose.CryptoKey | Uint8Array,
  expectedAlg?: string,
  expectedEnc?: string
): Promise<{ header: jose.CompactJWEHeaderParameters; plaintext: string; json: Record<string, unknown> }> {
  const trimmed = token.trim()
  const parts = trimmed.split('.')
  if (parts.length !== 5) {
    throw new JoseValidationError(`Invalid JWE format. Expected 5-part compact token, got ${parts.length} parts`, 400)
  }

  try {
    const result = await jose.compactDecrypt(trimmed, key)
    const header = result.protectedHeader

    if (expectedAlg && header.alg !== expectedAlg) {
      throw new JoseValidationError(`Expected JWE alg '${expectedAlg}', got '${header.alg}'`, 400)
    }
    if (expectedEnc && header.enc !== expectedEnc) {
      throw new JoseValidationError(`Expected JWE enc '${expectedEnc}', got '${header.enc}'`, 400)
    }

    const plaintext = new TextDecoder().decode(result.plaintext)
    let json: Record<string, unknown> = {}
    try {
      json = JSON.parse(plaintext) as Record<string, unknown>
    } catch {
      json = { raw: plaintext }
    }

    return { header, plaintext, json }
  } catch (err: unknown) {
    if (err instanceof JoseValidationError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    throw new JoseValidationError(`JWE payload decryption failed: ${msg}`, 400)
  }
}

/**
 * Validates and decrypts Field-Level Encryption (encData)
 */
export async function decryptFlePayload(
  rootObj: Record<string, unknown>,
  targetField = 'encData',
  key: jose.CryptoKey | Uint8Array,
  expectedFields?: string[]
): Promise<{ decryptedFields: Record<string, unknown>; mergedObj: Record<string, unknown> }> {
  const encData = rootObj[targetField]
  if (!encData || typeof encData !== 'string') {
    throw new JoseValidationError(`Missing JWE compact token in field '${targetField}'`, 400)
  }

  const { json } = await decryptCompactJwe(encData, key)

  if (expectedFields && expectedFields.length > 0) {
    for (const f of expectedFields) {
      if (!(f in json)) {
        throw new JoseValidationError(`Decrypted FLE payload is missing expected field '${f}'`, 400)
      }
    }
  }

  const mergedObj = { ...rootObj, [targetField]: json }
  return { decryptedFields: json, mergedObj }
}

/**
 * Validates Nested JOSE: Decrypts outer JWE -> Verifies inner JWS
 */
export async function verifyNestedSignThenEncrypt(
  rawBody: string,
  encKey: jose.CryptoKey | Uint8Array,
  signKey: jose.CryptoKey | Uint8Array
): Promise<{
  outerHeader: jose.CompactJWEHeaderParameters
  innerHeader: jose.CompactJWSHeaderParameters
  claims: Record<string, unknown>
}> {
  // 1. Decrypt outer JWE
  const { header: outerHeader, plaintext } = await decryptCompactJwe(rawBody, encKey)

  // 2. Validate inner JWS
  const innerToken = plaintext.trim()
  const parts = innerToken.split('.')
  if (parts.length !== 3) {
    throw new JoseValidationError(`Inner decrypted payload is not a 3-part JWS token`, 400)
  }

  const { header: innerHeader, claims } = await verifyAttachedJws(innerToken, signKey)

  return { outerHeader, innerHeader, claims }
}
