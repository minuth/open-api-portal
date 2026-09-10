import { JoseEngineService } from '../src/services/jose-engine'
import { JoseSecurityExtension, EphemeralKeyInput } from '../src/types/jose'
import * as jose from 'jose'
import * as crypto from 'crypto'

async function runAllTests() {
  const engine = new JoseEngineService()

  // Generate key pairs with extractable: true
  const signKeyPair = await jose.generateKeyPair('RS256', { extractable: true })
  const encKeyPair = await jose.generateKeyPair('RSA-OAEP-256', { extractable: true })

  const signPrivateKeyPem = await jose.exportPKCS8(signKeyPair.privateKey)
  const encPublicKeyPem = await jose.exportSPKI(encKeyPair.publicKey)

  const ephemeralKey: EphemeralKeyInput = {
    keyContent: signPrivateKeyPem,
    signingKeyContent: signPrivateKeyPem,
    encryptionKeyContent: encPublicKeyPem
  }

  const rawBody = JSON.stringify({
    accountNumber: "1234567890",
    amount: 100.50,
    currency: "USD",
    pin: "9876",
    pan: "4111222233334444"
  }, null, 2)

  // =========================================================================
  // TEST 1: FLE + Outer Signature Header (Pattern 1)
  // JWS claims in header + JWE claims inside encData
  // =========================================================================
  console.log('--- TEST 1: FLE + Outer Signature Header (Pattern 1) ---')
  const configPattern1: JoseSecurityExtension = {
    enabled: true,
    mode: 'both',
    claims: {
      iss: 'partner-app',
      scope: 'payments'
    },
    sign: {
      alg: 'RS256',
      placement: 'header',
      headerName: 'X-Signature',
      includeIat: true,
      includeJti: true,
      claims: {
        method: 'POST',
        uri: '/api/v1/transfer',
        aud: 'bank-gateway'
      }
    },
    encrypt: {
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      placement: 'field',
      targetField: 'encData',
      fields: ['pin', 'pan'],
      claims: {
        encPurpose: 'CUSTOMER_PIN_ENCRYPTION',
        vaultId: 'vault-01'
      }
    },
    computeDigest: true,
    digestHeaderName: 'Digest',
    digestAlgorithm: 'SHA-256'
  }

  const res1 = await engine.processOutgoingRequest(rawBody, {}, configPattern1, ephemeralKey)
  const outer1 = JSON.parse(res1.body!)

  // Decrypt encData to verify JWE claims
  const dec1 = await jose.compactDecrypt(outer1.encData, encKeyPair.privateKey)
  const jwePayload1 = JSON.parse(new TextDecoder().decode(dec1.plaintext))
  console.log('  JWE Payload (encData):', jwePayload1)
  if (jwePayload1.encPurpose !== 'CUSTOMER_PIN_ENCRYPTION' || jwePayload1.vaultId !== 'vault-01') {
    throw new Error('TEST 1 FAILED: JWE claims missing from encData!')
  }
  if (jwePayload1.pin !== '9876' || jwePayload1.pan !== '4111222233334444') {
    throw new Error('TEST 1 FAILED: Sensitive fields missing from encData!')
  }

  // Verify JWS header token
  const jwsClaims1 = jose.decodeJwt(res1.headers['X-Signature'])
  console.log('  JWS Claims (X-Signature):', jwsClaims1)
  if (jwsClaims1.iss !== 'partner-app' || jwsClaims1.method !== 'POST' || jwsClaims1.uri !== '/api/v1/transfer') {
    throw new Error('TEST 1 FAILED: JWS claims missing from X-Signature!')
  }
  const expectedDigest1 = `SHA-256=${crypto.createHash('sha256').update(res1.body!, 'utf8').digest('base64')}`
  if (jwsClaims1.digest !== expectedDigest1 || res1.headers['Digest'] !== expectedDigest1) {
    throw new Error('TEST 1 FAILED: Body digest mismatch in JWS claim or HTTP header!')
  }
  console.log('✓ TEST 1 PASSED: JWS claims & JWE claims work simultaneously in FLE Pattern 1!\n')

  // =========================================================================
  // TEST 2: Nested FLE (Pattern 2: Inner JWS inside encData JWE)
  // =========================================================================
  console.log('--- TEST 2: Nested FLE (Pattern 2) ---')
  const configPattern2: JoseSecurityExtension = {
    enabled: true,
    mode: 'both',
    sign: {
      alg: 'RS256',
      placement: 'field',
      includeIat: true,
      includeJti: true,
      claims: {
        signer: 'client-app',
        securityLevel: 'high'
      }
    },
    encrypt: {
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      placement: 'field',
      targetField: 'encData',
      fields: ['pin', 'pan']
    }
  }

  const res2 = await engine.processOutgoingRequest(rawBody, {}, configPattern2, ephemeralKey)
  const outer2 = JSON.parse(res2.body!)
  const dec2 = await jose.compactDecrypt(outer2.encData, encKeyPair.privateKey)
  const innerJwsStr2 = new TextDecoder().decode(dec2.plaintext)
  const innerClaims2 = jose.decodeJwt(innerJwsStr2)
  console.log('  Inner JWS claims inside encData:', innerClaims2)
  if (innerClaims2.signer !== 'client-app' || innerClaims2.securityLevel !== 'high' || innerClaims2.pin !== '9876') {
    throw new Error('TEST 2 FAILED: JWS claims or sensitive fields missing from nested FLE!')
  }
  console.log('✓ TEST 2 PASSED: JWS claims work inside nested FLE (Pattern 2)!\n')

  // =========================================================================
  // TEST 3: Full Body JWE + Header JWS Signature (Decoupled Mode)
  // =========================================================================
  console.log('--- TEST 3: Full Body JWE + Header JWS Signature ---')
  const configFullBody: JoseSecurityExtension = {
    enabled: true,
    mode: 'both',
    sign: {
      alg: 'RS256',
      placement: 'header',
      headerName: 'X-Signature',
      includeIat: true,
      includeJti: true,
      claims: {
        method: 'POST',
        uri: '/api/v1/payments',
        aud: 'payment-gateway'
      }
    },
    encrypt: {
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      placement: 'body',
      claims: {
        channel: 'MOBILE',
        tenantId: 'tenant-42'
      }
    },
    computeDigest: true,
    digestHeaderName: 'Digest',
    digestAlgorithm: 'SHA-256'
  }

  const res3 = await engine.processOutgoingRequest(rawBody, {}, configFullBody, ephemeralKey)
  if (res3.headers['Content-Type'] !== 'application/jose') {
    throw new Error('TEST 3 FAILED: Body should be application/jose!')
  }
  // Decrypt JWE body to verify JWE claims
  const dec3 = await jose.compactDecrypt(res3.body!, encKeyPair.privateKey)
  const jweBody3 = JSON.parse(new TextDecoder().decode(dec3.plaintext))
  console.log('  Decrypted JWE body:', jweBody3)
  if (jweBody3.channel !== 'MOBILE' || jweBody3.tenantId !== 'tenant-42' || jweBody3.accountNumber !== '1234567890') {
    throw new Error('TEST 3 FAILED: JWE claims or body fields missing from decrypted JWE body!')
  }

  // Verify JWS header token
  const jwsClaims3 = jose.decodeJwt(res3.headers['X-Signature'])
  console.log('  JWS Claims in header:', jwsClaims3)
  if (jwsClaims3.method !== 'POST' || jwsClaims3.uri !== '/api/v1/payments' || jwsClaims3.aud !== 'payment-gateway') {
    throw new Error('TEST 3 FAILED: JWS claims missing from header token!')
  }
  const expectedDigest3 = `SHA-256=${crypto.createHash('sha256').update(res3.body!, 'utf8').digest('base64')}`
  if (jwsClaims3.digest !== expectedDigest3 || res3.headers['Digest'] !== expectedDigest3) {
    throw new Error('TEST 3 FAILED: Body digest mismatch on JWE body!')
  }
  console.log('✓ TEST 3 PASSED: Full Body JWE with JWE claims + Header JWS with decoupled JWS claims and body digest!\n')

  // =========================================================================
  // TEST 4: Standard Nested (Sign-then-Encrypt, placement: 'body')
  // =========================================================================
  console.log('--- TEST 4: Standard Nested (Sign-then-Encrypt) ---')
  const configNested: JoseSecurityExtension = {
    enabled: true,
    mode: 'both',
    sign: {
      alg: 'RS256',
      placement: 'body',
      includeIat: true,
      includeJti: true,
      claims: {
        iss: 'nested-signer',
        sub: 'account-555'
      }
    },
    encrypt: {
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      placement: 'body'
    }
  }

  const res4 = await engine.processOutgoingRequest(rawBody, {}, configNested, ephemeralKey)
  const dec4 = await jose.compactDecrypt(res4.body!, encKeyPair.privateKey)
  const innerJwsStr4 = new TextDecoder().decode(dec4.plaintext)
  const innerClaims4 = jose.decodeJwt(innerJwsStr4)
  console.log('  Inner JWS claims:', innerClaims4)
  if (innerClaims4.iss !== 'nested-signer' || innerClaims4.sub !== 'account-555' || innerClaims4.accountNumber !== '1234567890') {
    throw new Error('TEST 4 FAILED: JWS claims or body fields missing from standard nested!')
  }
  console.log('✓ TEST 4 PASSED: Standard Nested mode preserves body and JWS claims!\n')

  console.log('==============================================')
  console.log('ALL 4 ARCHITECTURAL MODES VERIFIED 100% SUCCESS')
  console.log('==============================================')
}

runAllTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
