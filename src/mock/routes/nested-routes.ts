import crypto from 'node:crypto'
import { Hono } from 'hono'
import { LoadedKeys } from '../keys'
import {
  verifyAttachedJws,
  decryptCompactJwe,
  verifyNestedSignThenEncrypt,
  decryptFlePayload,
  JoseValidationError
} from '../jose-validator'

export function createNestedRoutes(keys: LoadedKeys): Hono {
  const router = new Hono()

  // 12. POST /api/v1/banking/wire-transfer (Nested Sign-Then-Encrypt JWE Body)
  router.post('/api/v1/banking/wire-transfer', async (c) => {
    const rawBody = await c.req.text()
    const { outerHeader, innerHeader, claims } = await verifyNestedSignThenEncrypt(
      rawBody,
      keys.rsaPrivateKey,
      keys.rsaPublicKey
    )

    console.log(
      `[Mock Server] [PASS] Decrypted & Verified Nested JOSE for /banking/wire-transfer (wire: ${claims.commercialWireId}, outer: ${outerHeader.alg}, inner: ${innerHeader.alg})`
    )

    return c.json(
      {
        wireReference: `FED-WIRE-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        status: 'CLEARING_QUEUED',
        _joseValidation: {
          nestedVerified: true,
          outerAlg: outerHeader.alg,
          outerEnc: outerHeader.enc,
          innerAlg: innerHeader.alg,
          cty: outerHeader.cty,
          wireId: claims.commercialWireId,
          amount: claims.amount
        }
      },
      202
    )
  })

  // 13. POST /api/v1/cards/verify-pin (FLE Pattern 1: encData + Outer X-Signature)
  router.post('/api/v1/cards/verify-pin', async (c) => {
    const rawBody = await c.req.text()
    const sigHeader = c.req.header('X-Signature') || c.req.header('x-signature')

    if (!sigHeader) {
      throw new JoseValidationError("Missing required outer 'X-Signature' header", 400)
    }

    // 1. Verify outer signature over JSON body
    const { header: sigHeaderInfo } = await verifyAttachedJws(sigHeader, keys.rsaPublicKey, 'RS256')

    // 2. Decrypt inner FLE encData
    let bodyJson: Record<string, unknown>
    try {
      bodyJson = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      throw new JoseValidationError('Invalid JSON request body', 400)
    }

    const { decryptedFields, mergedObj } = await decryptFlePayload(
      bodyJson,
      'encData',
      keys.rsaPrivateKey,
      ['pin', 'account']
    )

    console.log(
      `[Mock Server] [PASS] Verified Outer Signature & Decrypted encData for /cards/verify-pin (req: ${mergedObj.requestId})`
    )

    return c.json({
      valid: true,
      authCode: `AUTH_PIN_OK_${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      _joseValidation: {
        pattern: 'fle-outer-signature',
        signatureVerified: true,
        sigAlg: sigHeaderInfo.alg,
        encDataDecrypted: true,
        accountMasked: String(decryptedFields.account || '').slice(-4),
        requestId: mergedObj.requestId
      }
    })
  })

  // 14. POST /api/v1/cards/update-credentials (FLE Pattern 2: Nested FLE inside encData)
  router.post('/api/v1/cards/update-credentials', async (c) => {
    const body = await c.req.json()
    const encData = body['encData']

    if (!encData || typeof encData !== 'string') {
      throw new JoseValidationError("Missing compact JWE in 'encData'", 400)
    }

    // 1. Decrypt outer JWE in encData
    const { header: jweHeader, plaintext } = await decryptCompactJwe(encData, keys.rsaPrivateKey, 'RSA-OAEP-256')

    // 2. Verify inner JWS token
    const { header: jwsHeader, claims } = await verifyAttachedJws(plaintext, keys.rsaPublicKey, 'RS256')

    if (!('newPin' in claims) || !('pukCode' in claims)) {
      throw new JoseValidationError("Inner JWS payload must contain 'newPin' and 'pukCode'", 400)
    }

    console.log(
      `[Mock Server] [PASS] Decrypted & Verified Nested FLE in encData for /cards/update-credentials (cardToken: ${body.cardToken})`
    )

    return c.json({
      status: 'credentials_updated',
      _joseValidation: {
        pattern: 'nested-fle',
        encDataDecrypted: true,
        jweAlg: jweHeader.alg,
        jwsAlg: jwsHeader.alg,
        cardToken: body.cardToken
      }
    })
  })

  return router
}
