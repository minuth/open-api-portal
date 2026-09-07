export interface AlgorithmDescription {
  alg: string
  name: string
  standard: string
  keyType: string
  keyFormat: string
  keyRole: string
  curveOrBits: string
  family: 'RSA' | 'EC' | 'symmetric' | 'other'
}

export interface ContentCipherDescription {
  enc: string
  name: string
  standard: string
  cipherType: string
  keyBits: string
}

/**
 * Returns comprehensive cryptographic metadata for JWS signature algorithms
 */
export function describeSignatureAlgorithm(alg: string): AlgorithmDescription {
  const upper = alg.toUpperCase()
  switch (upper) {
    case 'RS256':
    case 'RS384':
    case 'RS512': {
      const shaBits = upper.slice(2)
      return {
        alg: upper,
        name: `RSASSA-PKCS1-v1_5 with SHA-${shaBits}`,
        standard: 'RFC 7518 §3.3',
        keyType: 'RSA Private Key',
        keyFormat: 'PKCS#8 (.pem), PKCS#1 (.pem), JWK (.json), DER (.der)',
        keyRole: 'Client Private Key (Sender Signature)',
        curveOrBits: '2048, 3072, or 4096-bit',
        family: 'RSA'
      }
    }
    case 'PS256':
    case 'PS384':
    case 'PS512': {
      const shaBits = upper.slice(2)
      return {
        alg: upper,
        name: `RSASSA-PSS with SHA-${shaBits} & MGF1`,
        standard: 'RFC 7518 §3.5 (FAPI 1.0 Advanced / FAPI 2.0)',
        keyType: 'RSA Private Key',
        keyFormat: 'PKCS#8 (.pem), PKCS#1 (.pem), JWK (.json), DER (.der)',
        keyRole: 'Client Private Key (Sender Signature)',
        curveOrBits: '2048, 3072, or 4096-bit',
        family: 'RSA'
      }
    }
    case 'ES256':
    case 'ES384':
    case 'ES512':
    case 'ES256K': {
      const curveMap: Record<string, string> = {
        ES256: 'P-256 (secp256r1)',
        ES384: 'P-384 (secp384r1)',
        ES512: 'P-521 (secp521r1)',
        ES256K: 'secp256k1'
      }
      return {
        alg: upper,
        name: `ECDSA using ${curveMap[upper] || 'EC'}`,
        standard: 'RFC 7518 §3.4',
        keyType: `EC Private Key (${curveMap[upper] || 'EC'})`,
        keyFormat: 'PKCS#8 (.pem), SEC1 (.pem), JWK (.json), DER (.der)',
        keyRole: 'Client Private Key (Sender Signature)',
        curveOrBits: curveMap[upper] || 'EC Curve',
        family: 'EC'
      }
    }
    case 'EDDSA':
      return {
        alg: 'EdDSA',
        name: 'Edwards-curve Digital Signature (Ed25519 / Ed448)',
        standard: 'RFC 8037 §3.1',
        keyType: 'OKP Private Key (Ed25519)',
        keyFormat: 'PKCS#8 (.pem), JWK (.json)',
        keyRole: 'Client Private Key (EdDSA Signature)',
        curveOrBits: 'Ed25519 (256-bit)',
        family: 'EC'
      }
    case 'HS256':
    case 'HS384':
    case 'HS512': {
      const shaBits = upper.slice(2)
      return {
        alg: upper,
        name: `HMAC using SHA-${shaBits}`,
        standard: 'RFC 7518 §3.2',
        keyType: 'Shared Symmetric Secret / Octet Key',
        keyFormat: 'Raw Text Secret (.txt), JWK (.json)',
        keyRole: 'Shared Symmetric Secret',
        curveOrBits: `${shaBits}-bit Secret (>= ${parseInt(shaBits, 10) / 8} bytes)`,
        family: 'symmetric'
      }
    }
    default: {
      const isRsa = upper.startsWith('RS') || upper.startsWith('PS')
      const isEc = upper.startsWith('ES') || upper.startsWith('ED')
      const isSym = upper.startsWith('HS')
      return {
        alg,
        name: `${alg} Signature`,
        standard: 'RFC 7518',
        keyType: 'Cryptographic Signing Key',
        keyFormat: 'PEM (.pem), JWK (.json), DER (.der)',
        keyRole: 'Signing Key',
        curveOrBits: 'Standard bit length',
        family: isRsa ? 'RSA' : isEc ? 'EC' : isSym ? 'symmetric' : 'other'
      }
    }
  }
}

/**
 * Returns comprehensive cryptographic metadata for JWE key management algorithms
 */
export function describeEncryptionAlgorithm(alg: string): AlgorithmDescription {
  const upper = alg.toUpperCase()
  switch (upper) {
    case 'RSA-OAEP':
    case 'RSA-OAEP-256':
    case 'RSA-OAEP-384':
    case 'RSA-OAEP-512': {
      const hashName = upper === 'RSA-OAEP' ? 'SHA-1' : upper.replace('RSA-OAEP-', 'SHA-')
      return {
        alg,
        name: `RSAES-OAEP with ${hashName} & MGF1`,
        standard: 'RFC 7518 §4.3',
        keyType: 'RSA Public Key / X.509 Certificate',
        keyFormat: 'SPKI (.pem), X.509 (.crt, .cer), JWK (.json), DER (.der)',
        keyRole: 'Server Public Key (Recipient Encryption)',
        curveOrBits: '2048, 3072, or 4096-bit',
        family: 'RSA'
      }
    }
    case 'ECDH-ES':
    case 'ECDH-ES+A128KW':
    case 'ECDH-ES+A192KW':
    case 'ECDH-ES+A256KW':
      return {
        alg,
        name: 'Elliptic Curve Diffie-Hellman Ephemeral Static (Key Agreement)',
        standard: 'RFC 7518 §4.6',
        keyType: 'EC Public Key (NIST P-256 / secp256r1)',
        keyFormat: 'SPKI (.pem), JWK (.json), DER (.der)',
        keyRole: 'Server Public Key (Key Agreement)',
        curveOrBits: 'P-256 Curve (256-bit)',
        family: 'EC'
      }
    case 'DIR':
      return {
        alg: 'dir',
        name: 'Direct Symmetric Key Encryption',
        standard: 'RFC 7518 §4.5',
        keyType: 'Pre-Shared Symmetric Key',
        keyFormat: 'Raw Secret (.txt), JWK (.json)',
        keyRole: 'Shared Secret Key (Direct CEK)',
        curveOrBits: '128, 192, or 256-bit Symmetric Key',
        family: 'symmetric'
      }
    case 'A128KW':
    case 'A192KW':
    case 'A256KW':
    case 'A128GCMKW':
    case 'A192GCMKW':
    case 'A256GCMKW': {
      const bits = upper.slice(1, 4)
      return {
        alg,
        name: `AES-${bits} Key Wrap`,
        standard: 'RFC 7518 §4.4',
        keyType: `AES-${bits} Key Encryption Key (KEK)`,
        keyFormat: 'JWK (.json), Raw Secret (.txt)',
        keyRole: 'Shared Key Wrap Secret',
        curveOrBits: `${bits}-bit AES Key`,
        family: 'symmetric'
      }
    }
    default: {
      const isRsa = upper.startsWith('RSA')
      const isEc = upper.startsWith('ECDH')
      const isSym = upper.startsWith('A') || upper === 'DIR' || upper.startsWith('PBES')
      return {
        alg,
        name: `${alg} Key Management`,
        standard: 'RFC 7518',
        keyType: 'Encryption Key / Certificate',
        keyFormat: 'PEM (.pem), JWK (.json), DER (.der)',
        keyRole: 'Recipient Key',
        curveOrBits: 'Standard bit length',
        family: isRsa ? 'RSA' : isEc ? 'EC' : isSym ? 'symmetric' : 'other'
      }
    }
  }
}

/**
 * Returns comprehensive metadata for JWE content encryption ciphers
 */
export function describeContentCipher(enc?: string): ContentCipherDescription {
  const encUpper = (enc || 'A256GCM').toUpperCase()
  switch (encUpper) {
    case 'A256GCM':
      return {
        enc: 'A256GCM',
        name: 'AES-256 Galois/Counter Mode (GCM)',
        standard: 'RFC 7518 §5.3',
        cipherType: 'Authenticated Encryption with Associated Data (AEAD)',
        keyBits: '256-bit CEK (128-bit Auth Tag, 96-bit IV)'
      }
    case 'A128CBC-HS256':
      return {
        enc: 'A128CBC-HS256',
        name: 'Composite AES-128-CBC + HMAC-SHA-256',
        standard: 'RFC 7518 §5.2.3',
        cipherType: 'Authenticated Cipher Stream (Composite AEAD)',
        keyBits: '256-bit Key (128-bit ENC + 128-bit MAC)'
      }
    case 'A192GCM':
      return {
        enc: 'A192GCM',
        name: 'AES-192 Galois/Counter Mode (GCM)',
        standard: 'RFC 7518 §5.3',
        cipherType: 'AEAD Authenticated Cipher',
        keyBits: '192-bit CEK (128-bit Auth Tag)'
      }
    case 'A128GCM':
      return {
        enc: 'A128GCM',
        name: 'AES-128 Galois/Counter Mode (GCM)',
        standard: 'RFC 7518 §5.3',
        cipherType: 'AEAD Authenticated Cipher',
        keyBits: '128-bit CEK (128-bit Auth Tag)'
      }
    default:
      return {
        enc: encUpper,
        name: `${encUpper} Content Cipher`,
        standard: 'RFC 7518',
        cipherType: 'Authenticated Cipher',
        keyBits: 'Standard Key Length'
      }
  }
}
