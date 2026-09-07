import process from 'node:process'
import { encryptAesGcm, decryptAesGcm } from '../utils/crypto-utils'

function getAppSecret(): string {
  return process.env.ENCRYPTION_SECRET || 'open-api-portal-secret-key-2026-secure-32byte!'
}

/**
 * Encrypts a plain-text token using AES-256-GCM and returns a unified string format: "iv.ciphertext.tag"
 */
export function encryptToken(plainText: string): string {
  const secret = getAppSecret()
  const payload = encryptAesGcm(plainText, secret)
  return `${payload.iv}.${payload.ciphertext}.${payload.tag}`
}

/**
 * Decrypts a unified string formatted as "iv.ciphertext.tag" back to plain-text token
 */
export function decryptToken(unifiedString: string): string {
  const secret = getAppSecret()
  const parts = unifiedString.split('.')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format. Expected "iv.ciphertext.tag".')
  }

  const [ivHex, ciphertext, tagHex] = parts
  return decryptAesGcm(ciphertext, ivHex, tagHex, secret)
}
