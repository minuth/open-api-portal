import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit IV for AES-GCM

export interface AesGcmPayload {
  ciphertext: string
  iv: string
  tag: string
}

/**
 * Derives a 32-byte key from a secret string using SHA-256
 */
export function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest()
}

/**
 * General-purpose AES-256-GCM encryption utility
 */
export function encryptAesGcm(plainText: string, keyInput: string | Buffer): AesGcmPayload {
  const key = typeof keyInput === 'string' ? deriveKey(keyInput) : keyInput
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plainText, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    tag
  }
}

/**
 * General-purpose AES-256-GCM decryption utility
 */
export function decryptAesGcm(
  ciphertext: string,
  ivHex: string,
  tagHex: string,
  keyInput: string | Buffer
): string {
  const key = typeof keyInput === 'string' ? deriveKey(keyInput) : keyInput
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)

  decipher.setAuthTag(tag)
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
