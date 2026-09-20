import fs from 'node:fs'
import path from 'node:path'
import * as jose from 'jose'

const DUMMY_KEYS_DIR = path.resolve(process.cwd(), 'dummy-keys')

export interface LoadedKeys {
  // RSA 2048
  rsaPublicPem: string
  rsaPrivatePem: string
  rsaPublicKey: jose.CryptoKey // RS256 signature verification
  rsaPsPublicKey: jose.CryptoKey // PS256 signature verification
  rsaOaepPublicKey: jose.CryptoKey // RSA-OAEP-256 encryption
  rsaPrivateKey: jose.CryptoKey // RSA-OAEP-256 decryption
  rsaSigPrivateKey: jose.CryptoKey // RS256 signature generation
  rsaPublicJwk: jose.JWK

  // EC P-256
  ecPublicPem: string
  ecPrivatePem: string
  ecPublicKey: jose.CryptoKey // ES256 signature verification
  ecPrivateKey: jose.CryptoKey // ES256 signature generation
  ecEcdhPublicKey: jose.CryptoKey // ECDH-ES key agreement
  ecEcdhPrivateKey: jose.CryptoKey // ECDH-ES decryption
  ecPublicJwk: jose.JWK

  // Symmetric (256-bit)
  symmetricJwk: jose.JWK
  symmetricSecret: Uint8Array
  symmetricKey: jose.CryptoKey | Uint8Array
}

let cachedKeys: LoadedKeys | null = null

export async function loadMockKeys(): Promise<LoadedKeys> {
  if (cachedKeys) return cachedKeys

  // 1. RSA
  const rsaPublicPem = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'rsa-public.pem'), 'utf-8')
  const rsaPrivatePem = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'rsa-private.pem'), 'utf-8')
  const rsaPublicJwk = JSON.parse(fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'rsa-public.jwk.json'), 'utf-8')) as jose.JWK

  const rsaPublicKey = (await jose.importSPKI(rsaPublicPem, 'RS256')) as jose.CryptoKey
  const rsaPsPublicKey = (await jose.importSPKI(rsaPublicPem, 'PS256')) as jose.CryptoKey
  const rsaOaepPublicKey = (await jose.importSPKI(rsaPublicPem, 'RSA-OAEP-256')) as jose.CryptoKey
  const rsaPrivateKey = (await jose.importPKCS8(rsaPrivatePem, 'RSA-OAEP-256')) as jose.CryptoKey
  const rsaSigPrivateKey = (await jose.importPKCS8(rsaPrivatePem, 'RS256')) as jose.CryptoKey

  // 2. EC
  const ecPublicPem = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'ec-public.pem'), 'utf-8')
  const ecPrivatePem = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'ec-private.pem'), 'utf-8')
  const ecPrivateJwk = JSON.parse(fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'ec-private.jwk.json'), 'utf-8')) as jose.JWK
  const { d: _, ...ecPublicJwk } = ecPrivateJwk

  const ecPublicKey = (await jose.importSPKI(ecPublicPem, 'ES256')) as jose.CryptoKey
  const ecPrivateKey = (await jose.importPKCS8(ecPrivatePem, 'ES256')) as jose.CryptoKey
  const ecEcdhPublicKey = (await jose.importSPKI(ecPublicPem, 'ECDH-ES+A256KW')) as jose.CryptoKey
  const ecEcdhPrivateKey = (await jose.importPKCS8(ecPrivatePem, 'ECDH-ES+A256KW')) as jose.CryptoKey

  // 3. Symmetric
  const symmetricJwk = JSON.parse(fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'symmetric-key.jwk.json'), 'utf-8')) as jose.JWK
  const symmetricSecretStr = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'symmetric-secret.txt'), 'utf-8').trim()
  const symmetricSecret = new Uint8Array(Buffer.from(symmetricSecretStr, 'hex'))
  const symmetricKey = (await jose.importJWK(symmetricJwk, 'HS256')) as jose.CryptoKey | Uint8Array

  cachedKeys = {
    rsaPublicPem,
    rsaPrivatePem,
    rsaPublicKey,
    rsaPsPublicKey,
    rsaOaepPublicKey,
    rsaPrivateKey,
    rsaSigPrivateKey,
    rsaPublicJwk,
    ecPublicPem,
    ecPrivatePem,
    ecPublicKey,
    ecPrivateKey,
    ecEcdhPublicKey,
    ecEcdhPrivateKey,
    ecPublicJwk: ecPublicJwk as jose.JWK,
    symmetricJwk,
    symmetricSecret,
    symmetricKey
  }

  return cachedKeys
}
