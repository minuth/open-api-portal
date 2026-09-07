import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import * as jose from 'jose'
import { serve } from '@hono/node-server'
import { loadMockKeys } from '../src/keys'
import { createApp } from '../src/app'

const BASE_URL = process.env.MOCK_URL || 'http://localhost:4000'
const DUMMY_KEYS_DIR = path.resolve(process.cwd(), '../dummy-keys')

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
  console.log(` Starting Isolated Mock Server Test Suite against ${BASE_URL}`)
  console.log(' Validating real cryptographic keys (JWS / JWE / Detached / Nested / FLE)')
  console.log('======================================================================\n')

  let serverInstance: ReturnType<typeof serve> | null = null
  try {
    await fetch(`${BASE_URL}/api/v1/health`)
  } catch {
    const mockKeys = await loadMockKeys()
    const app = createApp(mockKeys)
    serverInstance = serve({ fetch: app.fetch, port: 4000 })
    console.log('[Test Suite] Mock server auto-started in-process on port 4000')
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

    // 2. POST /api/v1/payments/instant-transfer (Detached JWS + Digest - ES256)
    await runTest(2, 'POST /api/v1/payments/instant-transfer', 'Detached JWS + RFC 3230 Digest (ES256)', async () => {
      const body = JSON.stringify({
        transferId: 'trns_7c8d9e0f',
        amount: 500.0,
        currency: 'EUR',
        debtorAccount: 'NL91ABNA0417164300',
        creditorAccount: 'DE02100100100123456789'
      })
      const fullJws = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({ alg: 'ES256', b64: true, crit: ['b64'] })
        .sign(keys.clientEcPriv)
      const parts = fullJws.split('.')
      const detachedSig = `${parts[0]}..${parts[2]}`
      const digest = computeDigest(body)

      const res = await fetch(`${BASE_URL}/api/v1/payments/instant-transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JWS-Signature': detachedSig,
          Digest: digest
        },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 3. POST /api/v1/oauth2/par (JWS Body Token - PS256)
    await runTest(3, 'POST /api/v1/oauth2/par', 'Compact JWS Body (PS256 / FAPI)', async () => {
      const payload = JSON.stringify({
        client_id: 'finsecure-partner-portal-01',
        response_type: 'code',
        redirect_uri: 'https://partner.example.com/oauth/callback',
        scope: 'openid accounts payments',
        state: 'af0ifjsldkj'
      })
      const bodyJws = await new jose.CompactSign(encoder.encode(payload))
        .setProtectedHeader({ alg: 'PS256', kid: 'client-fapi-ps256-key' })
        .sign(keys.clientRsaPrivPs)

      const res = await fetch(`${BASE_URL}/api/v1/oauth2/par`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: bodyJws
      })
      return { status: res.status, body: await res.json() }
    })

    // 4. POST /api/v1/webhooks/incoming-settlement (Symmetric HMAC - HS256)
    await runTest(4, 'POST /api/v1/webhooks/incoming-settlement', 'Symmetric HMAC Header (HS256)', async () => {
      const body = JSON.stringify({
        eventId: 'evt_batch_9921',
        batchId: 'bch_sepa_20260904_01',
        totalSettled: 184500.75,
        currency: 'EUR'
      })
      const sig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({ alg: 'HS256', kid: 'symmetric-key-01' })
        .sign(keys.symKey)

      const res = await fetch(`${BASE_URL}/api/v1/webhooks/incoming-settlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-HMAC-Signature': sig },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 5. POST /api/v1/compliance/eidas-report (x5t#S256 / x5c Cert Header - ES256)
    await runTest(5, 'POST /api/v1/compliance/eidas-report', 'eIDAS Certificate Binding (ES256)', async () => {
      const body = JSON.stringify({
        reportPeriod: '2026-Q3',
        financialInstitutionCode: 'BANKDEFFXXX',
        totalVolumeEur: 450000000.0,
        fraudRatioBps: 1.25
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

    // 5b. POST /api/v1/payments/corporate-transfer (RFC 7515 crit + Custom Headers - ES256)
    await runTest(6, 'POST /api/v1/payments/corporate-transfer', 'Critical Headers Enforcement (crit + custom parameters)', async () => {
      const body = JSON.stringify({
        corporateId: 'CORP-GLOBAL-4412',
        amount: 500000.0,
        currency: 'USD',
        memo: 'Quarterly dividend distribution'
      })
      const sig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({
          alg: 'ES256',
          b64: true,
          'x-custom-tenant-id': 'tenant-corp-8891',
          'x-policy-version': '2026-v2',
          crit: ['b64', 'x-custom-tenant-id', 'x-policy-version'],
          kid: 'partner-signer-2026'
        })
        .sign(keys.clientEcPriv, {
          crit: {
            b64: true,
            'x-custom-tenant-id': true,
            'x-policy-version': true
          }
        })

      const res = await fetch(`${BASE_URL}/api/v1/payments/corporate-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 6b. POST /api/v1/payments/orders (JWS Header with Payload Digest & Custom Claims - PS256)
    await runTest('6b', 'POST /api/v1/payments/orders', 'Decoupled JWS Header with Body Digest in Payload (PS256)', async () => {
      const body = JSON.stringify({
        orderId: 'ord_99210',
        amount: 1250.00,
        currency: 'EUR',
        merchantId: 'merch_finsecure_88'
      })
      const digest = `SHA-256=${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}`
      const jwsPayload = JSON.stringify({
        iat: Math.floor(Date.now() / 1000),
        jti: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        digest,
        iss: 'https://finsecure.bank.com',
        aud: 'https://api.partner.com',
        scope: 'orders:create'
      })

      const sig = await new jose.CompactSign(encoder.encode(jwsPayload))
        .setProtectedHeader({ alg: 'PS256', kid: 'client-fapi-ps256-key' })
        .sign(keys.clientRsaPrivPs)

      const res = await fetch(`${BASE_URL}/api/v1/payments/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
        body
      })
      const json = await res.json()
      if (
        json._joseValidation?.claims?.iss !== 'https://finsecure.bank.com' ||
        json._joseValidation?.claims?.aud !== 'https://api.partner.com' ||
        json._joseValidation?.claims?.scope !== 'orders:create'
      ) {
        throw new Error(`Custom claims not validated in mock server: ${JSON.stringify(json._joseValidation?.claims)}`)
      }
      return { status: res.status, body: json }
    })

    // 6. POST /api/v1/cards/tokenize (Asymmetric RSA-OAEP-256 + A256GCM)
    await runTest(7, 'POST /api/v1/cards/tokenize', 'Asymmetric JWE Body (RSA-OAEP-256/A256GCM)', async () => {
      const payload = JSON.stringify({
        cardNumber: '4532710012348901',
        expiryMonth: '12',
        expiryYear: '2028',
        cvv: '382',
        cardholderName: 'Sarah Connor'
      })
      const jwe = await new jose.CompactEncrypt(encoder.encode(payload))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: 'bank-vault-public-2026' })
        .encrypt(keys.bankRsaPub)

      const res = await fetch(`${BASE_URL}/api/v1/cards/tokenize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: jwe
      })
      return { status: res.status, body: await res.json() }
    })

    // 7. POST /api/v1/mobile/device-binding (ECDH-ES+A256KW + A256GCM)
    await runTest(7, 'POST /api/v1/mobile/device-binding', 'EC Diffie-Hellman Key Agreement (ECDH-ES)', async () => {
      const payload = JSON.stringify({
        deviceId: 'dev_iphone_15_pro_99a8b7',
        appInstanceId: 'inst_f47ac10b-58cc-4372-a567-0e02b2c3d479',
        hardwareAttestationNonce: 'W52K5l9aF8a9J1p0Xz99'
      })
      const jwe = await new jose.CompactEncrypt(encoder.encode(payload))
        .setProtectedHeader({ alg: 'ECDH-ES+A256KW', enc: 'A256GCM', kid: 'gateway-ecdh-p256-key' })
        .encrypt(keys.bankEcPub)

      const res = await fetch(`${BASE_URL}/api/v1/mobile/device-binding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: jwe
      })
      return { status: res.status, body: await res.json() }
    })

    // 8. POST /api/v1/vault/symmetric-secret (dir + A256GCM)
    await runTest(8, 'POST /api/v1/vault/symmetric-secret', 'Direct Symmetric JWE (dir/A256GCM)', async () => {
      const payload = JSON.stringify({
        secretNamespace: 'production/database/credentials',
        keyValues: { DB_USER: 'payment_service_prod', DB_PASS: 'secret-pass-2026' }
      })
      const jwe = await new jose.CompactEncrypt(encoder.encode(payload))
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', kid: 'symmetric-key-01' })
        .encrypt(keys.symSecret)

      const res = await fetch(`${BASE_URL}/api/v1/vault/symmetric-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: jwe
      })
      return { status: res.status, body: await res.json() }
    })

    // 9. POST /api/v1/batch/clearing-file (A256KW + A128CBC-HS256)
    await runTest(9, 'POST /api/v1/batch/clearing-file', 'Symmetric AES Key Wrap (A256KW/A128CBC-HS256)', async () => {
      const payload = JSON.stringify({
        clearingCycle: '2026-CYCLE-14',
        totalTransactions: 15420,
        settlementAmount: 12450890.3,
        currency: 'EUR'
      })
      const jwe = await new jose.CompactEncrypt(encoder.encode(payload))
        .setProtectedHeader({ alg: 'A256KW', enc: 'A128CBC-HS256', kid: 'symmetric-key-01' })
        .encrypt(keys.symSecret)

      const res = await fetch(`${BASE_URL}/api/v1/batch/clearing-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: jwe
      })
      return { status: res.status, body: await res.json() }
    })

    // 10. POST /api/v1/sessions/exchange (JWE in Header X-Encrypted-Token)
    await runTest(10, 'POST /api/v1/sessions/exchange', 'Header-Placed JWE Token (RSA-OAEP-256)', async () => {
      const tokenPayload = JSON.stringify({
        clientId: 'client_mobile_pos_001',
        sessionNonce: 'nonce_98a72b11',
        issuedAt: Math.floor(Date.now() / 1000)
      })
      const jweHeader = await new jose.CompactEncrypt(encoder.encode(tokenPayload))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
        .encrypt(keys.bankRsaPub)

      const body = JSON.stringify({
        clientId: 'client_mobile_pos_001',
        grantType: 'urn:ietf:params:oauth:grant-type:token-exchange'
      })

      const res = await fetch(`${BASE_URL}/api/v1/sessions/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Encrypted-Token': jweHeader
        },
        body
      })
      const json = await res.json()
      if (
        json._joseValidation?.headerPayload?.clientId !== 'client_mobile_pos_001' ||
        json._joseValidation?.headerPayload?.sessionNonce !== 'nonce_98a72b11'
      ) {
        throw new Error(`JWE header payload claims not validated: ${JSON.stringify(json._joseValidation?.headerPayload)}`)
      }
      return { status: res.status, body: json }
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
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', cty: 'JWT', kid: 'bank-vault-public-2026' })
        .encrypt(keys.bankRsaPub)

      const res = await fetch(`${BASE_URL}/api/v1/banking/wire-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose' },
        body: outerJwe
      })
      return { status: res.status, body: await res.json() }
    })

    // 13. POST /api/v1/cards/verify-pin (FLE Pattern 1: Outer JWS Signature + encData)
    await runTest(13, 'POST /api/v1/cards/verify-pin', 'FLE Pattern 1 (encData JWE + Outer X-Signature JWS)', async () => {
      const pinPayload = JSON.stringify({ pin: 1234, account: '234567654' })
      const encData = await new jose.CompactEncrypt(encoder.encode(pinPayload))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
        .encrypt(keys.bankRsaPub)

      const outerBody = JSON.stringify({
        requestId: 'req_992140',
        partnerId: 'partner_eu_01',
        encData
      })

      const outerSig = await new jose.CompactSign(encoder.encode(outerBody))
        .setProtectedHeader({ alg: 'RS256', kid: 'partner-signer-2026' })
        .sign(keys.clientRsaPriv)

      const res = await fetch(`${BASE_URL}/api/v1/cards/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': outerSig
        },
        body: outerBody
      })
      return { status: res.status, body: await res.json() }
    })

    // 14. POST /api/v1/cards/update-credentials (FLE Pattern 2: Nested FLE inside encData)
    await runTest(14, 'POST /api/v1/cards/update-credentials', 'FLE Pattern 2 (Inner Sign-Then-Encrypt in encData)', async () => {
      const sensitivePayload = JSON.stringify({ newPin: 9876, pukCode: '88219472' })
      const innerJws = await new jose.CompactSign(encoder.encode(sensitivePayload))
        .setProtectedHeader({ alg: 'RS256' })
        .sign(keys.clientRsaPriv)

      const encData = await new jose.CompactEncrypt(encoder.encode(innerJws))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', cty: 'JWT' })
        .encrypt(keys.bankRsaPub)

      const body = JSON.stringify({
        requestId: 'req_upd_8831',
        cardToken: 'tok_visa_4532_9901',
        encData
      })

      const res = await fetch(`${BASE_URL}/api/v1/cards/update-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
      return { status: res.status, body: await res.json() }
    })

    // 15. POST /api/v1/banking/account-statement (Bidirectional: Signed Request, Encrypted Response)
    await runTest(15, 'POST /api/v1/banking/account-statement', 'Bidirectional JOSE (ES256 request -> JWE response)', async () => {
      const body = JSON.stringify({
        accountId: 'acc_eur_88192301',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        format: 'JSON'
      })
      const sig = await new jose.CompactSign(encoder.encode(body))
        .setProtectedHeader({ alg: 'ES256', kid: 'client-ec-key-2026' })
        .sign(keys.clientEcPriv)
      const digest = computeDigest(body)

      const res = await fetch(`${BASE_URL}/api/v1/banking/account-statement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': sig,
          Digest: digest
        },
        body
      })

      // Decrypt the returned JWE statement using Client's RSA Private Key
      const encryptedStatement = await res.text()
      const dec = await jose.compactDecrypt(encryptedStatement.trim(), keys.clientRsaPrivOaep)
      const decryptedJws = new TextDecoder().decode(dec.plaintext)

      // Verify the inner signed statement using Bank's EC Public Key
      const verified = await jose.compactVerify(decryptedJws, keys.bankEcPubSig)
      const statementJson = JSON.parse(new TextDecoder().decode(verified.payload))

      return {
        status: res.status,
        body: {
          decrypted: true,
          statementId: statementJson.statementId,
          balance: statementJson.balance
        }
      }
    })

    // 16. GET /api/v1/health (Standard Public)
    await runTest(16, 'GET /api/v1/health', 'Standard Public Health Endpoint (No JOSE)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/health`)
      return { status: res.status, body: await res.json() }
    })

    // Negative Tests: Verify security failures are rejected
    console.log('\n--- Negative Security Validation Checks ---')
    await runTest(17, 'POST /api/v1/payments/create', 'Reject Forged/Corrupted JWS Signature', async () => {
      const body = JSON.stringify({ amount: 100 })
      const res = await fetch(`${BASE_URL}/api/v1/payments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': 'invalid.signature.token' },
        body
      })
      return { status: res.status === 401 ? 200 : res.status, body: await res.json() }
    })

    await runTest(18, 'POST /api/v1/payments/instant-transfer', 'Reject Tampered RFC 3230 Digest', async () => {
      const body = JSON.stringify({ amount: 500 })
      const res = await fetch(`${BASE_URL}/api/v1/payments/instant-transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JWS-Signature': 'header..sig',
          Digest: 'SHA-256=TAMPERED_HASH'
        },
        body
      })
      return { status: res.status === 400 ? 200 : res.status, body: await res.json() }
    })

    await runTest(19, 'POST /api/v1/payments/orders', 'Reject Tampered Body against Payload Digest Claim', async () => {
      const originalBody = JSON.stringify({ orderId: 'ord_99210', amount: 1250.00 })
      const digest = `SHA-256=${crypto.createHash('sha256').update(originalBody, 'utf8').digest('base64')}`
      const jwsPayload = JSON.stringify({ digest })

      const sig = await new jose.CompactSign(encoder.encode(jwsPayload))
        .setProtectedHeader({ alg: 'PS256', kid: 'client-fapi-ps256-key' })
        .sign(keys.clientRsaPrivPs)

      // Send tampered body with higher amount
      const tamperedBody = JSON.stringify({ orderId: 'ord_99210', amount: 999999.00 })
      const res = await fetch(`${BASE_URL}/api/v1/payments/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
        body: tamperedBody
      })
      return { status: res.status === 400 ? 200 : res.status, body: await res.json() }
    })

    console.log('\n======================================================================')
    console.log(' Test Summary')
    console.log('======================================================================')
    const passed = results.filter((r) => r.status === 'PASS').length
    console.log(` Total Scenarios Tested: ${results.length}`)
    console.log(` Passed: ${passed} / ${results.length}`)
    if (passed === results.length) {
      console.log(' ALL 16 OPENAPI JOSE SCENARIOS + NEGATIVE CHECKS PASSED!')
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

if (process.argv[1]?.endsWith('test-suite.ts')) {
  runAllTests().catch((err) => {
    console.error('Fatal test runner error:', err)
    process.exit(1)
  })
}
