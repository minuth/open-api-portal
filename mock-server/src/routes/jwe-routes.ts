import crypto from 'node:crypto'
import { Hono } from 'hono'
import { LoadedKeys } from '../keys'
import {
  decryptCompactJwe,
  decryptFlePayload,
  JoseValidationError
} from '../middleware/jose-validator'

export function createJweRoutes(keys: LoadedKeys): Hono {
  const router = new Hono()

  // 6. POST /api/v1/cards/tokenize (Asymmetric RSA-OAEP-256 + A256GCM JWE Body)
  router.post('/api/v1/cards/tokenize', async (c) => {
    const rawBody = await c.req.text()
    const { header, json } = await decryptCompactJwe(rawBody, keys.rsaPrivateKey, 'RSA-OAEP-256', 'A256GCM')
    console.log(`[Mock Server] [PASS] Decrypted JWE Body for /cards/tokenize (alg: ${header.alg}, enc: ${header.enc})`)

    const pan = String(json.cardNumber || '4532710012348901')
    const maskedPan = pan.length >= 4 ? `************${pan.slice(-4)}` : '************8901'

    return c.json({
      cardToken: `tok_visa_${crypto.randomBytes(4).toString('hex')}`,
      maskedPan,
      _joseValidation: {
        decrypted: true,
        alg: header.alg,
        enc: header.enc,
        expiryYear: json.expiryYear
      }
    })
  })

  // 7. POST /api/v1/mobile/device-binding (ECDH-ES+A256KW + A256GCM JWE Body)
  router.post('/api/v1/mobile/device-binding', async (c) => {
    const rawBody = await c.req.text()
    const { header, json } = await decryptCompactJwe(rawBody, keys.ecEcdhPrivateKey, 'ECDH-ES+A256KW', 'A256GCM')
    console.log(`[Mock Server] [PASS] Decrypted ECDH-ES JWE Body for /mobile/device-binding (device: ${json.deviceId})`)

    return c.json(
      {
        bindingId: `bind_mobile_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        status: 'ACTIVE',
        _joseValidation: {
          decrypted: true,
          alg: header.alg,
          enc: header.enc,
          deviceId: json.deviceId
        }
      },
      201
    )
  })

  // 8. POST /api/v1/vault/symmetric-secret (dir + A256GCM JWE Body)
  router.post('/api/v1/vault/symmetric-secret', async (c) => {
    const rawBody = await c.req.text()
    const { header, json } = await decryptCompactJwe(rawBody, keys.symmetricSecret, 'dir', 'A256GCM')
    console.log(`[Mock Server] [PASS] Decrypted Direct Symmetric JWE for /vault/symmetric-secret (namespace: ${json.secretNamespace})`)

    return c.json({
      syncedAt: new Date().toISOString(),
      version: 4,
      _joseValidation: {
        decrypted: true,
        alg: header.alg,
        enc: header.enc,
        namespace: json.secretNamespace
      }
    })
  })

  // 9. POST /api/v1/batch/clearing-file (A256KW + A128CBC-HS256 JWE Body)
  router.post('/api/v1/batch/clearing-file', async (c) => {
    const rawBody = await c.req.text()
    const { header, json } = await decryptCompactJwe(rawBody, keys.symmetricSecret, 'A256KW', 'A128CBC-HS256')
    console.log(`[Mock Server] [PASS] Decrypted AES Key Wrap JWE for /batch/clearing-file (cycle: ${json.clearingCycle})`)

    return c.json(
      {
        jobId: `job_clr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        state: 'INGESTED',
        _joseValidation: {
          decrypted: true,
          alg: header.alg,
          enc: header.enc,
          cycle: json.clearingCycle
        }
      },
      202
    )
  })

  // 10. POST /api/v1/sessions/exchange (JWE in Header X-Encrypted-Token)
  router.post('/api/v1/sessions/exchange', async (c) => {
    const tokenHeader = c.req.header('X-Encrypted-Token') || c.req.header('x-encrypted-token')

    if (!tokenHeader) {
      throw new JoseValidationError("Missing required 'X-Encrypted-Token' header", 400)
    }

    const { header, json } = await decryptCompactJwe(tokenHeader, keys.rsaPrivateKey, 'RSA-OAEP-256', 'A256GCM')
    console.log(`[Mock Server] [PASS] Decrypted JWE Header for /sessions/exchange (alg: ${header.alg}, enc: ${header.enc})`)

    return c.json({
      sessionId: `sess_${crypto.randomBytes(8).toString('hex')}`,
      expiresIn: 3600,
      _joseValidation: {
        decrypted: true,
        alg: header.alg,
        enc: header.enc,
        headerPayload: json
      }
    })
  })

  // 11. POST /api/v1/checkout/direct-charge (Pure Field-Level Encryption into encData)
  router.post('/api/v1/checkout/direct-charge', async (c) => {
    const body = await c.req.json()
    const { decryptedFields, mergedObj } = await decryptFlePayload(
      body,
      'encData',
      keys.rsaPrivateKey,
      ['cardNumber', 'cvv', 'expiryMonth', 'expiryYear']
    )

    console.log(
      `[Mock Server] [PASS] Decrypted Pure FLE encData for /checkout/direct-charge (order: ${mergedObj.orderId})`
    )

    return c.json({
      chargeId: `chg_${crypto.randomBytes(6).toString('hex')}`,
      status: 'AUTHORIZED',
      _joseValidation: {
        decrypted: true,
        flePattern: 'pure',
        panLast4: String(decryptedFields.cardNumber || '').slice(-4),
        orderId: mergedObj.orderId
      }
    })
  })

  return router
}
