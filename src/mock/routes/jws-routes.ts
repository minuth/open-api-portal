import crypto from 'node:crypto'
import { Hono } from 'hono'
import { LoadedKeys } from '../keys'
import {
  verifyAttachedJws,
  verifyDetachedJws,
  verifyDigestHeader,
  verifyPayloadDigest,
  JoseValidationError
} from '../jose-validator'

export function createJwsRoutes(keys: LoadedKeys): Hono {
  const router = new Hono()

  // 1. POST /api/v1/payments/create (Header JWS - RS256)
  router.post('/api/v1/payments/create', async (c) => {
    const rawBody = await c.req.text()
    const sigHeader = c.req.header('X-Signature') || c.req.header('x-signature')

    if (!sigHeader) {
      throw new JoseValidationError("Missing required 'X-Signature' header", 400)
    }

    const { header, claims } = await verifyAttachedJws(sigHeader, keys.rsaPublicKey, 'RS256')
    console.log(`[Mock Server] [PASS] Verified JWS signature for /payments/create (alg: ${header.alg}, kid: ${header.kid})`)

    return c.json(
      {
        paymentId: `pmnt_${crypto.randomBytes(6).toString('hex')}`,
        status: 'PENDING_EXECUTION',
        _joseValidation: {
          verified: true,
          alg: header.alg,
          kid: header.kid,
          debtorIban: claims.debtorIban || 'DE89370400440532013000'
        }
      },
      201
    )
  })

  // 2. POST /api/v1/payments/instant-transfer (Detached JWS + RFC 3230 Digest - ES256)
  router.post('/api/v1/payments/instant-transfer', async (c) => {
    const rawBody = await c.req.text()
    const sigHeader = c.req.header('X-JWS-Signature') || c.req.header('x-jws-signature')
    const digestHeader = c.req.header('Digest') || c.req.header('digest')

    // Validate Digest
    verifyDigestHeader(digestHeader, rawBody, 'SHA-256')

    if (!sigHeader) {
      throw new JoseValidationError("Missing required 'X-JWS-Signature' header", 400)
    }

    // Validate Detached JWS
    const { header } = await verifyDetachedJws(sigHeader, rawBody, keys.ecPublicKey, 'ES256')
    console.log(`[Mock Server] [PASS] Verified Detached JWS signature & Digest for /instant-transfer (alg: ${header.alg})`)

    let bodyJson: Record<string, unknown> = {}
    try {
      bodyJson = JSON.parse(rawBody)
    } catch {}

    return c.json({
      transferId: bodyJson.transferId || `trns_${crypto.randomBytes(4).toString('hex')}`,
      clearedAt: new Date().toISOString(),
      status: 'SETTLED',
      _joseValidation: {
        verified: true,
        digestMatched: true,
        alg: header.alg
      }
    })
  })

  // 3. POST /api/v1/oauth2/par (JWS Body Token - PS256)
  router.post('/api/v1/oauth2/par', async (c) => {
    const rawBody = await c.req.text()
    const trimmed = rawBody.trim()

    if (!trimmed) {
      throw new JoseValidationError('Missing compact JWS request body', 400)
    }

    const { header, claims } = await verifyAttachedJws(trimmed, keys.rsaPsPublicKey, 'PS256')
    console.log(`[Mock Server] [PASS] Verified PS256 JWS Body Token for /oauth2/par (client_id: ${claims.client_id})`)

    return c.json(
      {
        request_uri: `urn:ietf:params:oauth:request_uri:${crypto.randomBytes(16).toString('hex')}`,
        expires_in: 90,
        _joseValidation: {
          verified: true,
          alg: header.alg,
          clientId: claims.client_id
        }
      },
      201
    )
  })

  // 4. POST /api/v1/webhooks/incoming-settlement (Symmetric HMAC - HS256)
  router.post('/api/v1/webhooks/incoming-settlement', async (c) => {
    const rawBody = await c.req.text()
    const sigHeader = c.req.header('X-HMAC-Signature') || c.req.header('x-hmac-signature')

    if (!sigHeader) {
      throw new JoseValidationError("Missing required 'X-HMAC-Signature' header", 400)
    }

    const { header, claims } = await verifyAttachedJws(sigHeader, keys.symmetricKey, 'HS256')
    console.log(`[Mock Server] [PASS] Verified Symmetric HMAC (HS256) for /webhooks/incoming-settlement (kid: ${header.kid})`)

    return c.json({
      received: true,
      batchStatus: 'ACKNOWLEDGED',
      _joseValidation: {
        verified: true,
        alg: header.alg,
        eventId: claims.eventId
      }
    })
  })

  // 5. POST /api/v1/compliance/eidas-report (x5t#S256 / x5c Certificate Header - ES256)
  router.post('/api/v1/compliance/eidas-report', async (c) => {
    const rawBody = await c.req.text()
    const sigHeader = c.req.header('X-Signature') || c.req.header('x-signature')

    if (!sigHeader) {
      throw new JoseValidationError("Missing required 'X-Signature' header", 400)
    }

    const { header, claims } = await verifyAttachedJws(sigHeader, keys.ecPublicKey, 'ES256')
    console.log(
      `[Mock Server] [PASS] Verified eIDAS JWS with cert thumbprint (x5t: ${Boolean(header['x5t#S256'])}, x5c: ${Boolean(header.x5c)})`
    )

    return c.json({
      reportId: `rep_eidas_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      acknowledgementToken: 'ack_valid_eidas_sig',
      _joseValidation: {
        verified: true,
        alg: header.alg,
        x5tPresent: Boolean(header['x5t#S256']),
        institution: claims.financialInstitutionCode
      }
    })
  })

  // 6. POST /api/v1/payments/corporate-transfer (Custom Critical Headers - ES256 with crit)
  router.post('/api/v1/payments/corporate-transfer', async (c) => {
    const rawBody = await c.req.text()
    const sigHeader = c.req.header('X-Signature') || c.req.header('x-signature')

    if (!sigHeader) {
      throw new JoseValidationError("Missing required 'X-Signature' header", 400)
    }

    const { header, claims } = await verifyAttachedJws(
      sigHeader,
      keys.ecPublicKey,
      'ES256',
      {
        crit: {
          b64: true,
          'x-custom-tenant-id': true,
          'x-policy-version': true
        }
      }
    )

    console.log(
      `[Mock Server] [PASS] Verified JWS with Critical Headers for /payments/corporate-transfer (crit: ${JSON.stringify(header.crit)}, tenant: ${header['x-custom-tenant-id']})`
    )

    let bodyJson: Record<string, unknown> = {}
    try {
      bodyJson = JSON.parse(rawBody)
    } catch {
      bodyJson = claims
    }

    return c.json(
      {
        transferId: `corp_trns_${crypto.randomBytes(4).toString('hex')}`,
        status: 'ACCEPTED_CRITICAL_VALIDATED',
        timestamp: new Date().toISOString(),
        _joseValidation: {
          verified: true,
          alg: header.alg,
          crit: header.crit,
          customTenantId: header['x-custom-tenant-id'],
          policyVersion: header['x-policy-version'],
          amount: bodyJson.amount,
          currency: bodyJson.currency
        }
      },
      201
    )
  })

  // 7. POST /api/v1/payments/orders (JWS in Header with Body Digest in Payload Claims - PS256)
  router.post('/api/v1/payments/orders', async (c) => {
    const rawBody = await c.req.text()
    const sigHeader = c.req.header('X-Signature') || c.req.header('x-signature')

    if (!sigHeader) {
      throw new JoseValidationError("Missing required 'X-Signature' header", 400)
    }

    const { header, claims } = await verifyAttachedJws(sigHeader, keys.rsaPsPublicKey, 'PS256')

    // Validate that the body's digest is present and valid inside the JWS token claims
    verifyPayloadDigest(claims, rawBody, 'digest', 'SHA-256')
    console.log(`[Mock Server] [PASS] Verified JWS signature & payload digest claim for /payments/orders (alg: ${header.alg})`)

    let bodyJson: Record<string, unknown> = {}
    try {
      bodyJson = JSON.parse(rawBody)
    } catch {}

    return c.json(
      {
        orderId: bodyJson.orderId || `ord_${crypto.randomBytes(4).toString('hex')}`,
        status: 'CONFIRMED',
        _joseValidation: {
          verified: true,
          payloadDigestVerified: true,
          alg: header.alg,
          kid: header.kid,
          claims
        }
      },
      201
    )
  })

  return router
}
