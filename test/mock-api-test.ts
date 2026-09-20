import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import * as jose from 'jose'
import { serve } from '@hono/node-server'
import { loadMockKeys } from '../src/mock/keys'
import { createMockApp } from '../src/mock/mock-app'

const PORT = Number(process.env.PORT) || 3000
const BASE_URL = process.env.MOCK_URL || `http://localhost:${PORT}`
const DUMMY_KEYS_DIR = path.resolve(process.cwd(), 'dummy-keys')

// Load Client & Server Keys for Testing
async function loadTestKeys() {
  const rsaPrivPem = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'rsa-private.pem'), 'utf-8')
  const rsaPubPem = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'rsa-public.pem'), 'utf-8')
  const ecPrivPem = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'ec-private.pem'), 'utf-8')
  const ecPubPem = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'ec-public.pem'), 'utf-8')
  const symJwk = JSON.parse(fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'symmetric-key.jwk.json'), 'utf-8')) as jose.JWK
  const symSecretHex = fs.readFileSync(path.join(DUMMY_KEYS_DIR, 'symmetric-secret.txt'), 'utf-8').trim()
  const symSecret = new Uint8Array(Buffer.from(symSecretHex, 'hex'))

  return {
    clientRsaPriv: await jose.importPKCS8(rsaPrivPem, 'RS256'),
    clientRsaPrivPs: await jose.importPKCS8(rsaPrivPem, 'PS256'),
    clientRsaPrivOaep: await jose.importPKCS8(rsaPrivPem, 'RSA-OAEP-256'),
    bankRsaPub: await jose.importSPKI(rsaPubPem, 'RSA-OAEP-256'),
    bankRsaPubSig: await jose.importSPKI(rsaPubPem, 'RS256'),

    clientEcPriv: await jose.importPKCS8(ecPrivPem, 'ES256'),
    bankEcPub: await jose.importSPKI(ecPubPem, 'ECDH-ES+A256KW'),
    bankEcPubSig: await jose.importSPKI(ecPubPem, 'ES256'),

    symKey: (await jose.importJWK(symJwk, 'HS256')) as jose.CryptoKey | Uint8Array,
    symSecret
  }
}

function computeDigest(body: string): string {
  const hash = crypto.createHash('sha256').update(body, 'utf8').digest('base64')
  return `SHA-256=${hash}`
}

interface TestResult {
  num: number
  endpoint: string
  scenario: string
  status: 'PASS' | 'FAIL'
  code: number
  details: string
}

const results: TestResult[] = []

async function runTest(
  num: number,
  endpoint: string,
  scenario: string,
  fn: () => Promise<{ status: number; body: unknown }>
) {
  try {
    const res = await fn()
    const pass = res.status >= 200 && res.status < 300
    results.push({
      num,
      endpoint,
      scenario,
      status: pass ? 'PASS' : 'FAIL',
      code: res.status,
      details: pass ? 'Validated with real keys' : JSON.stringify(res.body)
    })
    console.log(`  [#${num.toString().padStart(2, '0')}] ${pass ? '✔ PASS' : '✖ FAIL'} (${res.status}) ${endpoint} - ${scenario}`)
  } catch (err: unknown) {
    results.push({
      num,
      endpoint,
      scenario,
      status: 'FAIL',
      code: 0,
      details: err instanceof Error ? err.message : String(err)
    })
    console.log(`  [#${num.toString().padStart(2, '0')}] ✖ ERROR: ${endpoint} - ${err}`)
  }
}

export async function runAllTests() {
  console.log('======================================================================')
  console.log(` Starting Mock API Test Suite against unified server: ${BASE_URL}`)
  console.log(' Validating real cryptographic keys (JWS / JWE / Detached / Nested / FLE)')
  console.log('======================================================================\n')

  let serverInstance: ReturnType<typeof serve> | null = null
  try {
    await fetch(`${BASE_URL}/api/v1/health`)
  } catch {
    const mockKeys = await loadMockKeys()
    const app = createMockApp(mockKeys)
    serverInstance = serve({ fetch: app.fetch, port: PORT })
    console.log(`[Test Suite] Mock server auto-started in-process on unified port ${PORT}`)
  }

  try {
    const keys = await loadTestKeys()
    const encoder = new TextEncoder()

    // 1. POST /api/v1/payments/create (JWS Header - RS256)
    await runTest(1, 'POST /api/v1/payments/create', 'Header Attached JWS (RS256)', async () => {
      const body = JSON.stringify({
        debtorIban: 'DE89370400440532013000',
        creditorIban: 'FR1420041010050500013M02606',
        amount: 1250.5,
        currency: 'EUR',
        reference: 'INV-2026-0901'
      })
      const sig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({ alg: 'RS256', kid: 'partner-signer-2026' })
        .sign(keys.clientRsaPriv)

      const res = await fetch(`${BASE_URL}/api/v1/payments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 2. POST /api/v1/payments/instant-transfer (Detached JWS + RFC 3230 Digest - ES256)
    await runTest(2, 'POST /api/v1/payments/instant-transfer', 'Detached JWS (ES256) + SHA-256 Digest', async () => {
      const body = JSON.stringify({
        amount: 500.0,
        currency: 'EUR',
        debtorAccount: 'NL91ABNA0417164300',
        creditorAccount: 'DE02100100100123456789'
      })
      const fullSig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({ alg: 'ES256', b64: true, crit: ['b64'] })
        .sign(keys.clientEcPriv)
      const parts = fullSig.split('.')
      const detachedSig = `${parts[0]}..${parts[2]}`
      const digest = computeDigest(body)

      const res = await fetch(`${BASE_URL}/api/v1/payments/instant-transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Digest: digest,
          'X-JWS-Signature': detachedSig
        },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 3. POST /api/v1/oauth2/par (JWS Body Token - PS256)
    await runTest(3, 'POST /api/v1/oauth2/par', 'Direct JWS Compact Body (PS256)', async () => {
      const parPayload = JSON.stringify({
        client_id: 'finsecure-partner-corp-01',
        response_type: 'code',
        scope: 'openid payments:create',
        redirect_uri: 'https://partner.example/oauth/callback',
        state: 'st_981a72',
        code_challenge: 'E9Melhoa2OwvFrGMTJguCH5rtx64ZW_63x9v-Vi_9R8',
        code_challenge_method: 'S256'
      })
      const tokenBody = await new jose.CompactSign(encoder.encode(parPayload))
        .setProtectedHeader({ alg: 'PS256', typ: 'oauth-authz-req+jwt' })
        .sign(keys.clientRsaPrivPs)

      const res = await fetch(`${BASE_URL}/api/v1/oauth2/par`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/oauth-authz-req+jwt' },
        body: tokenBody
      })
      return { status: res.status, body: await res.json() }
    })

    // 4. POST /api/v1/webhooks/incoming-settlement (Symmetric HMAC - HS256)
    await runTest(4, 'POST /api/v1/webhooks/incoming-settlement', 'Symmetric HMAC Signing (HS256)', async () => {
      const body = JSON.stringify({
        eventId: `evt_${Date.now()}`,
        eventType: 'clearing.settlement.completed',
        timestamp: new Date().toISOString(),
        settlementBatchId: 'batch_eur_2026_0901_01',
        clearedAmount: 1540200.0,
        currency: 'EUR'
      })
      const sig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({ alg: 'HS256', kid: 'symmetric-hmac-2026' })
        .sign(keys.symKey)

      const res = await fetch(`${BASE_URL}/api/v1/webhooks/incoming-settlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-HMAC-Signature': sig },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 5. POST /api/v1/compliance/eidas-report (x5t#S256 Certificate Header - ES256)
    await runTest(5, 'POST /api/v1/compliance/eidas-report', 'Certificate Thumbprint Header x5t#S256 (ES256)', async () => {
      const body = JSON.stringify({
        financialInstitutionCode: 'DE-BAFIN-992101',
        reportingPeriod: '2026-Q3',
        totalTransactionsCount: 1420910,
        fraudIncidenceRate: 0.00012,
        supervisoryAuthority: 'BaFin'
      })
      const sig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({
          alg: 'ES256',
          kid: 'qtsp-eidas-cert-2026',
          'x5t#S256': 'dGVzdC10aHVtYnByaW50LXNoYTI1Ng'
        })
        .sign(keys.clientEcPriv)

      const res = await fetch(`${BASE_URL}/api/v1/compliance/eidas-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 6. POST /api/v1/cards/tokenize (Asymmetric RSA-OAEP-256 + A256GCM JWE Body)
    await runTest(6, 'POST /api/v1/cards/tokenize', 'Asymmetric Key Wrap JWE (RSA-OAEP-256 + A256GCM)', async () => {
      const cardPlaintext = JSON.stringify({
        cardNumber: '4532710012348901',
        cardholderName: 'Alex Morgan',
        expiryMonth: '11',
        expiryYear: '2028',
        cvv: '381'
      })
      const jweBody = await new jose.CompactEncrypt(encoder.encode(cardPlaintext))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: 'bank-gateway-enc-2026' })
        .encrypt(keys.bankRsaPub)

      const res = await fetch(`${BASE_URL}/api/v1/cards/tokenize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: jweBody
      })
      return { status: res.status, body: await res.json() }
    })

    // 7. POST /api/v1/mobile/device-binding (ECDH-ES+A256KW + A256GCM JWE Body)
    await runTest(7, 'POST /api/v1/mobile/device-binding', 'Elliptic Curve Key Agreement (ECDH-ES+A256KW + A256GCM)', async () => {
      const bindingPlaintext = JSON.stringify({
        deviceId: `dev_pixel_${Date.now()}`,
        deviceModel: 'Pixel 9 Pro',
        secureEnclaveId: 'se_chip_9941a8',
        boundAt: new Date().toISOString()
      })
      const jweBody = await new jose.CompactEncrypt(encoder.encode(bindingPlaintext))
        .setProtectedHeader({ alg: 'ECDH-ES+A256KW', enc: 'A256GCM' })
        .encrypt(keys.bankEcPub)

      const res = await fetch(`${BASE_URL}/api/v1/mobile/device-binding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: jweBody
      })
      return { status: res.status, body: await res.json() }
    })

    // 8. POST /api/v1/vault/symmetric-secret (dir + A256GCM Direct Symmetric JWE Body)
    await runTest(8, 'POST /api/v1/vault/symmetric-secret', 'Direct Symmetric Encryption (dir + A256GCM)', async () => {
      const secretPayload = JSON.stringify({
        secretNamespace: 'payments.gateway.credentials',
        credentials: { apiKey: 'live_sec_prod_991823', webhookSecret: 'whsec_99a81c7' }
      })
      const jweBody = await new jose.CompactEncrypt(encoder.encode(secretPayload))
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(keys.symSecret)

      const res = await fetch(`${BASE_URL}/api/v1/vault/symmetric-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: jweBody
      })
      return { status: res.status, body: await res.json() }
    })

    // 9. POST /api/v1/batch/clearing-file (A256KW + A128CBC-HS256 Symmetric AES Key Wrap)
    await runTest(9, 'POST /api/v1/batch/clearing-file', 'Symmetric AES Key Wrap (A256KW + A128CBC-HS256)', async () => {
      const batchPayload = JSON.stringify({
        clearingCycle: '2026-09-01-EVENING',
        settlementCurrency: 'EUR',
        instructionCount: 8520,
        totalNetDebit: 12900420.55
      })
      const jweBody = await new jose.CompactEncrypt(encoder.encode(batchPayload))
        .setProtectedHeader({ alg: 'A256KW', enc: 'A128CBC-HS256' })
        .encrypt(keys.symSecret)

      const res = await fetch(`${BASE_URL}/api/v1/batch/clearing-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: jweBody
      })
      return { status: res.status, body: await res.json() }
    })

    // 10. POST /api/v1/sessions/exchange (JWE in Header X-Encrypted-Token)
    await runTest(10, 'POST /api/v1/sessions/exchange', 'Header Attached Encrypted Token (X-Encrypted-Token)', async () => {
      const tokenPlaintext = JSON.stringify({
        clientId: 'partner-app-01',
        sessionChallenge: crypto.randomUUID(),
        timestamp: Date.now()
      })
      const jweToken = await new jose.CompactEncrypt(encoder.encode(tokenPlaintext))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
        .encrypt(keys.bankRsaPub)

      const res = await fetch(`${BASE_URL}/api/v1/sessions/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Encrypted-Token': jweToken
        },
        body: JSON.stringify({ grantType: 'session_exchange' })
      })
      return { status: res.status, body: await res.json() }
    })

    // 11. POST /api/v1/checkout/direct-charge (Pure Field-Level Encryption into encData)
    await runTest(11, 'POST /api/v1/checkout/direct-charge', 'Pure FLE (encData encrypted without signature)', async () => {
      const sensitiveCardData = JSON.stringify({
        cardNumber: '4532710012348901',
        cvv: '821',
        expiryMonth: '08',
        expiryYear: '2029'
      })
      const encData = await new jose.CompactEncrypt(encoder.encode(sensitiveCardData))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
        .encrypt(keys.bankRsaPub)

      const body = JSON.stringify({
        orderId: 'ord_ecom_2026_99812',
        merchantId: 'merch_nordic_retail_01',
        amount: 89.95,
        currency: 'EUR',
        encData
      })

      const res = await fetch(`${BASE_URL}/api/v1/checkout/direct-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 12. POST /api/v1/banking/wire-transfer (Nested Sign-Then-Encrypt JWE Body)
    await runTest(12, 'POST /api/v1/banking/wire-transfer', 'Nested Sign-Then-Encrypt (JWS inside JWE, cty: JWT)', async () => {
      const wireData = JSON.stringify({
        commercialWireId: 'WIRE-2026-X990',
        amount: 2500000.0,
        currency: 'USD',
        authorizingOfficer: 'Jane Doe (VP Finance)'
      })
      // Inner JWS
      const innerJws = await new jose.CompactSign(encoder.encode(wireData))
        .setProtectedHeader({ alg: 'RS256', kid: 'partner-signer-2026' })
        .sign(keys.clientRsaPriv)

      // Outer JWE
      const outerJwe = await new jose.CompactEncrypt(encoder.encode(innerJws))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', cty: 'JWT' })
        .encrypt(keys.bankRsaPub)

      const res = await fetch(`${BASE_URL}/api/v1/banking/wire-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: outerJwe
      })
      return { status: res.status, body: await res.json() }
    })

    // 13. POST /api/v1/cards/verify-pin (FLE Pattern 1: encData + Outer X-Signature)
    await runTest(13, 'POST /api/v1/cards/verify-pin', 'FLE Pattern 1: encData with Signed Outer Request Body', async () => {
      const pinPlaintext = JSON.stringify({ pin: '4921', account: 'acc_eur_9921004' })
      const encData = await new jose.CompactEncrypt(encoder.encode(pinPlaintext))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
        .encrypt(keys.bankRsaPub)

      const body = JSON.stringify({
        requestId: `req_pin_${Date.now()}`,
        atmTerminalId: 'ATM_BERLIN_CENTRAL_04',
        encData
      })

      const sig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({ alg: 'RS256', kid: 'partner-signer-2026' })
        .sign(keys.clientRsaPriv)

      const res = await fetch(`${BASE_URL}/api/v1/cards/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 14. POST /api/v1/cards/update-credentials (FLE Pattern 2: Nested FLE inside encData)
    await runTest(14, 'POST /api/v1/cards/update-credentials', 'FLE Pattern 2: Nested Sign-Then-Encrypt inside encData', async () => {
      const credsPlaintext = JSON.stringify({ newPin: '8832', pukCode: '99201844' })
      const innerJws = await new jose.CompactSign(encoder.encode(credsPlaintext))
        .setProtectedHeader({ alg: 'RS256' })
        .sign(keys.clientRsaPriv)

      const encData = await new jose.CompactEncrypt(encoder.encode(innerJws))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', cty: 'JWT' })
        .encrypt(keys.bankRsaPub)

      const res = await fetch(`${BASE_URL}/api/v1/cards/update-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardToken: 'tok_visa_8829104', encData })
      })
      return { status: res.status, body: await res.json() }
    })

    // 15. POST /api/v1/banking/account-statement (Bidirectional)
    await runTest(15, 'POST /api/v1/banking/account-statement', 'Bidirectional Verification (Signed Request + Encrypted Response)', async () => {
      const body = JSON.stringify({ accountId: 'acc_eur_88192301', statementMonth: '2026-08' })
      const digest = computeDigest(body)
      const sig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({ alg: 'ES256' })
        .sign(keys.clientEcPriv)

      const res = await fetch(`${BASE_URL}/api/v1/banking/account-statement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Digest: digest,
          'X-Signature': sig
        },
        body
      })

      if (res.status === 200) {
        const encryptedResponse = await res.text()
        const decrypted = await jose.compactDecrypt(encryptedResponse, keys.clientRsaPrivOaep)
        const innerJwsToken = new TextDecoder().decode(decrypted.plaintext)
        const verified = await jose.compactVerify(innerJwsToken, keys.bankEcPubSig)
        const claims = JSON.parse(new TextDecoder().decode(verified.payload))
        return { status: res.status, body: { balance: claims.balance, transactions: claims.transactions?.length } }
      }
      return { status: res.status, body: await res.text() }
    })

    // 16. GET /api/v1/health
    await runTest(16, 'GET /api/v1/health', 'Standard Public Health Check', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/health`)
      return { status: res.status, body: await res.json() }
    })

    // 17. GET /.well-known/jwks.json
    await runTest(17, 'GET /.well-known/jwks.json', 'Public JWKS Discovery Key Set', async () => {
      const res = await fetch(`${BASE_URL}/.well-known/jwks.json`)
      return { status: res.status, body: await res.json() }
    })

    // 18. POST /api/v1/auth/token
    let issuedToken = ''
    await runTest(18, 'POST /api/v1/auth/token', 'OAuth2 Client Credentials -> Issue Signed Bearer JWT', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'alex.morgan',
          client_secret: 'mock-portal-secret'
        })
      })
      const data = (await res.json()) as { access_token?: string }
      if (data.access_token) issuedToken = data.access_token
      return { status: res.status, body: data }
    })

    // 19. GET /api/v1/auth/me (Bearer)
    await runTest(19, 'GET /api/v1/auth/me', 'Authenticate via Issued Bearer JWT Token', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${issuedToken}` }
      })
      return { status: res.status, body: await res.json() }
    })

    // 20. GET /api/v1/auth/me (API Key)
    await runTest(20, 'GET /api/v1/auth/me', 'Authenticate via X-API-KEY Header', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
        headers: { 'X-API-KEY': 'finsec_live_9941a87b2c01994e' }
      })
      return { status: res.status, body: await res.json() }
    })

    console.log('\n======================================================================')
    console.log(' Test Summary')
    console.log('======================================================================')
    const passed = results.filter((r) => r.status === 'PASS').length
    console.log(` Total Scenarios Tested: ${results.length}`)
    console.log(` Passed: ${passed} / ${results.length}`)
    if (passed === results.length) {
      console.log(' ALL OPENAPI JOSE SCENARIOS PASSED AGAINST UNIFIED MOCK SERVER!')
    } else {
      console.error(' SOME TESTS FAILED!')
      process.exit(1)
    }
  } finally {
    if (serverInstance) {
      serverInstance.close()
    }
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})
