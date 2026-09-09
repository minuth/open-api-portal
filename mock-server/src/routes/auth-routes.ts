import crypto from 'node:crypto'
import { Hono } from 'hono'
import * as jose from 'jose'
import { LoadedKeys } from '../keys'
import { JoseValidationError } from '../middleware/jose-validator'

export function createAuthRoutes(keys: LoadedKeys): Hono {
  const router = new Hono()

  // 1. POST /api/v1/auth/token - Issue Signed Bearer JWT Access Token
  router.post('/api/v1/auth/token', async (c) => {
    let body: Record<string, unknown> = {}
    const contentType = c.req.header('content-type') || ''

    if (contentType.includes('application/json')) {
      try {
        body = await c.req.json()
      } catch {
        body = {}
      }
    } else {
      try {
        body = await c.req.parseBody()
      } catch {
        body = {}
      }
    }

    const grantType = String(body.grant_type || 'client_credentials')
    const clientId = String(body.client_id || body.username || 'finsecure-partner-portal-01')
    const scope = String(body.scope || 'payments:create payments:read statements:read clearing:submit')

    // Create a cryptographically signed RS256 JWT access token
    const nowSec = Math.floor(Date.now() / 1000)
    const token = await new jose.SignJWT({
      sub: clientId === 'alex.morgan' ? 'usr_sec_9941' : clientId,
      name: clientId === 'alex.morgan' ? 'Alex Morgan' : 'FinSecure Institutional Agent',
      client_id: clientId,
      role: 'Treasury Officer',
      scope,
      iss: 'https://sandbox.finsecure-bank.example',
      aud: 'https://api.finsecure-bank.example'
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'partner-signer-2026', typ: 'JWT' })
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + 3600)
      .setJti(crypto.randomUUID())
      .sign(keys.rsaSigPrivateKey)

    console.log(`[Mock Server] [PASS] Issued Bearer JWT for ${clientId} (grant: ${grantType}, alg: RS256)`)

    return c.json(
      {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope,
        user: {
          id: clientId === 'alex.morgan' ? 'usr_sec_9941' : 'usr_sec_partner_01',
          name: clientId === 'alex.morgan' ? 'Alex Morgan' : 'FinSecure Partner Officer',
          email: `${clientId}@finsecure-partner.example`,
          role: 'Treasury Officer'
        }
      },
      200
    )
  })

  // 2. GET /api/v1/auth/me - Validate Token / API Key & Return Authenticated Identity
  router.get('/api/v1/auth/me', async (c) => {
    const authHeader = c.req.header('Authorization') || c.req.header('authorization')
    const apiKeyHeader = c.req.header('X-API-KEY') || c.req.header('x-api-key')

    // Scenario A: Bearer Token Authentication
    if (authHeader && authHeader.trim().toLowerCase().startsWith('bearer ')) {
      const rawToken = authHeader.trim().substring(7).trim()

      if (!rawToken) {
        return c.json(
          {
            error: 'UNAUTHORIZED',
            message: 'Bearer token value is empty'
          },
          401
        )
      }

      let claims: Record<string, unknown> = {}
      try {
        const verified = await jose.jwtVerify(rawToken, keys.rsaPublicKey, {
          issuer: 'https://sandbox.finsecure-bank.example',
          audience: 'https://api.finsecure-bank.example'
        })
        claims = verified.payload
      } catch {
        // Fallback: decode claims or permit mock testing tokens
        try {
          claims = jose.decodeJwt(rawToken) as Record<string, unknown>
        } catch {
          claims = {
            sub: 'usr_sec_9941',
            name: 'Alex Morgan',
            role: 'Treasury Officer',
            scope: 'payments:create payments:read statements:read clearing:submit'
          }
        }
      }

      console.log(`[Mock Server] [PASS] Authenticated /auth/me via Bearer Token (sub: ${claims.sub || 'usr_sec_9941'})`)

      return c.json({
        authenticated: true,
        authMethod: 'Bearer JWT (RS256)',
        userId: claims.sub || 'usr_sec_9941',
        name: claims.name || 'Alex Morgan',
        role: claims.role || 'Treasury Officer',
        scopes: typeof claims.scope === 'string' ? claims.scope.split(' ') : ['payments:create', 'payments:read', 'statements:read', 'clearing:submit'],
        status: 'ACTIVE'
      })
    }

    // Scenario B: API Key Authentication
    if (apiKeyHeader && apiKeyHeader.trim()) {
      console.log(`[Mock Server] [PASS] Authenticated /auth/me via X-API-KEY (${apiKeyHeader.trim().slice(0, 10)}...)`)
      return c.json({
        authenticated: true,
        authMethod: 'API Key (X-API-KEY)',
        apiKeyPrefix: `${apiKeyHeader.trim().slice(0, 8)}...`,
        clientId: 'srv_partner_corp_01',
        role: 'Institutional Machine Agent',
        scopes: ['payments:create', 'payments:read', 'clearing:submit'],
        status: 'ACTIVE'
      })
    }

    // Neither credential provided: 401 Unauthorized
    console.warn(`[Mock Server] [AUTH FAILED] Missing Authorization / X-API-KEY on /api/v1/auth/me`)
    return c.json(
      {
        error: 'UNAUTHORIZED',
        message: "Missing authentication credentials. Provide 'Authorization: Bearer <token>' or 'X-API-KEY: <key>' header."
      },
      401
    )
  })

  // 3. POST /api/v1/auth/api-key - Issue Fresh Institutional API Key
  router.post('/api/v1/auth/api-key', async (c) => {
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    const keyName = String(body.keyName || 'Primary Production Gateway Key')
    const apiKey = `finsec_live_${crypto.randomBytes(16).toString('hex')}`

    console.log(`[Mock Server] [PASS] Generated institutional API key: ${keyName}`)

    return c.json(
      {
        apiKey,
        keyName,
        status: 'ACTIVE',
        scope: 'payments:create payments:read statements:read clearing:submit',
        createdAt: new Date().toISOString()
      },
      201
    )
  })

  // 4. POST /api/v1/auth/revoke - Revoke Active Token / Session
  router.post('/api/v1/auth/revoke', async (c) => {
    const authHeader = c.req.header('Authorization') || c.req.header('authorization')
    const apiKeyHeader = c.req.header('X-API-KEY') || c.req.header('x-api-key')

    if (!authHeader && !apiKeyHeader) {
      return c.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Provide Bearer token or API key to revoke'
        },
        401
      )
    }

    console.log(`[Mock Server] [PASS] Revoked credentials on /api/v1/auth/revoke`)

    return c.json({
      revoked: true,
      message: 'Token or credential successfully revoked.'
    })
  })

  return router
}
