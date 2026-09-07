import crypto from 'node:crypto'
import { Hono } from 'hono'
import * as jose from 'jose'
import { LoadedKeys } from '../keys'
import {
  verifyAttachedJws,
  verifyDigestHeader,
  JoseValidationError
} from '../middleware/jose-validator'

export function createPublicRoutes(keys: LoadedKeys): Hono {
  const router = new Hono()

  // 15. POST /api/v1/banking/account-statement (Bidirectional: Verify Request + Encrypt Response)
  router.post('/api/v1/banking/account-statement', async (c) => {
    const rawBody = await c.req.text()
    const sigHeader = c.req.header('X-Signature') || c.req.header('x-signature')
    const digestHeader = c.req.header('Digest') || c.req.header('digest')

    // 1. Verify Request Digest
    verifyDigestHeader(digestHeader, rawBody, 'SHA-256')

    // 2. Verify Request Signature
    if (!sigHeader) {
      throw new JoseValidationError("Missing required 'X-Signature' header", 400)
    }
    const { header: reqHeader, claims: reqClaims } = await verifyAttachedJws(sigHeader, keys.ecPublicKey, 'ES256')
    console.log(`[Mock Server] [PASS] Verified request signature for /banking/account-statement (acc: ${reqClaims.accountId})`)

    // 3. Craft Mock Statement Plaintext
    const statementData = {
      statementId: `stmt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      accountId: reqClaims.accountId || 'acc_eur_88192301',
      generatedAt: new Date().toISOString(),
      balance: 145290.4,
      currency: 'EUR',
      transactions: [
        { id: 'tx_01', date: '2026-08-05', desc: 'Payroll Settlement', amount: 8500.0, type: 'CR' },
        { id: 'tx_02', date: '2026-08-12', desc: 'AWS Cloud Services', amount: -1240.5, type: 'DR' },
        { id: 'tx_03', date: '2026-08-28', desc: 'Client Transfer FR99', amount: 43200.0, type: 'CR' }
      ]
    }

    // 4. Inner JWS: Sign statement with Bank's EC Private Key
    const encoder = new TextEncoder()
    const innerJws = await new jose.CompactSign(encoder.encode(JSON.stringify(statementData)))
      .setProtectedHeader({ alg: 'ES256', kid: 'bank-gateway-signer-2026' })
      .sign(keys.ecPrivateKey)

    // 5. Outer JWE: Encrypt inner JWS with Client's RSA Public Key (cty: JWT)
    const encryptedResponse = await new jose.CompactEncrypt(encoder.encode(innerJws))
      .setProtectedHeader({
        alg: 'RSA-OAEP-256',
        enc: 'A256GCM',
        cty: 'JWT',
        kid: 'client-receiver-key-2026'
      })
      .encrypt(keys.rsaOaepPublicKey)

    console.log(`[Mock Server] [PASS] Generated encrypted & signed JWE response for /banking/account-statement`)

    return new Response(encryptedResponse, {
      status: 200,
      headers: {
        'Content-Type': 'application/jose',
        'X-Response-Signature': innerJws
      }
    })
  })

  // 16. GET /api/v1/health (Standard Public)
  router.get('/api/v1/health', (c) => {
    return c.json({
      status: 'pass',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      service: 'finsecure-jose-mock-gateway'
    })
  })

  // Public JWKS Discovery: GET /.well-known/jwks.json
  router.get('/.well-known/jwks.json', (c) => {
    return c.json({
      keys: [
        { ...keys.rsaPublicJwk, use: 'sig', alg: 'RS256' },
        { ...keys.ecPublicJwk, use: 'sig', alg: 'ES256' }
      ]
    })
  })

  return router
}
