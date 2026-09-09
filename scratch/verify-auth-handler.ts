import assert from 'node:assert/strict'
import { resolveEndpointSecurity, buildAuthHeadersAndQuery, decodeJwtPayload, formatSchemeDisplay } from '../src/utils/auth-metadata'
import { EndpointOperation, OpenApiDocument } from '../src/types/openapi'
import { ClientAuthConfig } from '../src/types/auth'

console.log('--- [Test 1] OpenAPI Security Resolution ---')

const dummySpec: OpenApiDocument = {
  id: 'spec-test-01',
  title: 'Test Banking API',
  version: '1.0.0',
  endpoints: [],
  securitySchemes: {
    OAuth2: {
      type: 'oauth2',
      description: 'Customer OAuth2 Access',
      flows: {
        authorizationCode: {
          authorizationUrl: 'https://auth.example.com/oauth/authorize',
          tokenUrl: 'https://auth.example.com/oauth/token',
          scopes: { 'read:accounts': 'Read customer accounts', 'write:transfers': 'Create wire transfers' }
        }
      }
    },
    ApiKeyAuth: {
      type: 'apiKey',
      name: 'X-API-KEY',
      in: 'header',
      description: 'Partner API Key'
    },
    QueryApiKey: {
      type: 'apiKey',
      name: 'api_token',
      in: 'query'
    },
    BasicHttpAuth: {
      type: 'http',
      scheme: 'basic'
    },
    BearerJwt: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT'
    }
  },
  globalSecurity: [
    { BearerJwt: [] }
  ]
}

// 1a. Endpoint with no security specified inherits root globalSecurity
const inheritEp: EndpointOperation = {
  id: 'get-accounts',
  method: 'GET',
  path: '/accounts'
}
const resInherit = resolveEndpointSecurity(inheritEp, dummySpec)
assert.equal(resInherit.isSecured, true, 'Inherited security should be secured')
assert.equal(resInherit.isExplicitlyUnsecured, false)
assert.equal(resInherit.schemes.length, 1)
assert.equal(resInherit.primaryScheme?.name, 'BearerJwt')
assert.equal(resInherit.primaryScheme?.type, 'bearer')
console.log('✔ 1a: Endpoint successfully inherits global security (BearerJwt)')

// 1b. Endpoint with operation.security = [] overrides and is public
const publicEp: EndpointOperation = {
  id: 'get-health',
  method: 'GET',
  path: '/health',
  security: []
}
const resPublic = resolveEndpointSecurity(publicEp, dummySpec)
assert.equal(resPublic.isSecured, false, 'Operation security = [] must be unsecured')
assert.equal(resPublic.isExplicitlyUnsecured, true, 'Should be explicitly unsecured')
assert.equal(resPublic.schemes.length, 0)
console.log('✔ 1b: Endpoint with operation.security = [] correctly resolves as Public')

// 1c. Endpoint with specific scheme and declared scopes
const transferEp: EndpointOperation = {
  id: 'post-transfers',
  method: 'POST',
  path: '/transfers',
  security: [
    { OAuth2: ['read:accounts', 'write:transfers'] }
  ]
}
const resTransfer = resolveEndpointSecurity(transferEp, dummySpec)
assert.equal(resTransfer.isSecured, true)
assert.equal(resTransfer.primaryScheme?.name, 'OAuth2')
assert.equal(resTransfer.primaryScheme?.type, 'oauth2')
assert.deepEqual(resTransfer.primaryScheme?.scopes, ['read:accounts', 'write:transfers'])
console.log('✔ 1c: Endpoint with OAuth2 declared scopes correctly resolved')

console.log('\n--- [Test 2] Header and Query Parameter Conversion ---')

// 2a. Bearer token
const bearerAuth: ClientAuthConfig = {
  type: 'bearer',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig',
  bearerPrefix: 'Bearer'
}
const resBearer = buildAuthHeadersAndQuery(bearerAuth)
assert.equal(resBearer.headers['Authorization'], 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig')
assert.deepEqual(resBearer.queryParams, {})
console.log('✔ 2a: Bearer token builds Authorization header correctly')

// 2a-2. Bearer token with accidental user-pasted 'Bearer ' prefix
const bearerWithPastedPrefix: ClientAuthConfig = {
  type: 'bearer',
  token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig'
}
const resPasted = buildAuthHeadersAndQuery(bearerWithPastedPrefix)
assert.equal(resPasted.headers['Authorization'], 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig')
console.log('✔ 2a-2: Bearer token automatically strips accidental user-pasted "Bearer " prefix')

// 2b. API Key in Header
const apiKeyHeader: ClientAuthConfig = {
  type: 'apiKey',
  apiKeyName: 'X-CUSTOM-KEY',
  apiKeyValue: 'secret_key_12345',
  apiKeyPlacement: 'header'
}
const resKeyHeader = buildAuthHeadersAndQuery(apiKeyHeader)
assert.equal(resKeyHeader.headers['X-CUSTOM-KEY'], 'secret_key_12345')
console.log('✔ 2b: API Key in header placed correctly')

// 2c. API Key in Query
const apiKeyQuery: ClientAuthConfig = {
  type: 'apiKey',
  apiKeyName: 'api_token',
  apiKeyValue: 'token_abc',
  apiKeyPlacement: 'query'
}
const resKeyQuery = buildAuthHeadersAndQuery(apiKeyQuery)
assert.equal(resKeyQuery.queryParams['api_token'], 'token_abc')
assert.equal(resKeyQuery.headers['api_token'], undefined)
console.log('✔ 2c: API Key in query parameter placed correctly')

// 2d. Basic Auth
const basicAuth: ClientAuthConfig = {
  type: 'basic',
  username: 'admin',
  password: 'Password123!'
}
const resBasic = buildAuthHeadersAndQuery(basicAuth)
const expectedBase64 = Buffer.from('admin:Password123!').toString('base64')
assert.equal(resBasic.headers['Authorization'], `Basic ${expectedBase64}`)
console.log(`✔ 2d: Basic auth encoded correctly (Basic ${expectedBase64})`)

// 2e. Custom Header
const customAuth: ClientAuthConfig = {
  type: 'custom',
  customHeaderName: 'X-Organization-ID',
  customHeaderValue: 'org_881923'
}
const resCustom = buildAuthHeadersAndQuery(customAuth)
assert.equal(resCustom.headers['X-Organization-ID'], 'org_881923')
console.log('✔ 2e: Custom header builds correctly')

// 2f. No Auth (strips credentials)
const noAuth: ClientAuthConfig = { type: 'none' }
const resNone = buildAuthHeadersAndQuery(noAuth)
assert.deepEqual(resNone.headers, {})
assert.deepEqual(resNone.queryParams, {})
console.log('✔ 2f: No Auth returns empty headers and query params')

console.log('\n--- [Test 3] Live JWT Claims Parsing & Expiration ---')

const nowSec = Math.floor(Date.now() / 1000)
// Create a sample valid JWT (expires in 2 hours)
const validJwtHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
const validJwtPayload = Buffer.from(JSON.stringify({
  sub: 'user_44921',
  iss: 'https://auth.company.com',
  aud: 'portal-client-app',
  exp: nowSec + 7200,
  iat: nowSec
})).toString('base64url')
const testJwt = `${validJwtHeader}.${validJwtPayload}.dummy_signature`

const decoded = decodeJwtPayload(testJwt)
assert.equal(decoded.valid, true)
assert.equal(decoded.sub, 'user_44921')
assert.equal(decoded.iss, 'https://auth.company.com')
assert.equal(decoded.aud, 'portal-client-app')
assert.equal(decoded.isExpired, false)
assert.ok(decoded.expiresIn?.includes('Expires in'), `Expires in should be present: ${decoded.expiresIn}`)
console.log(`✔ 3a: Valid JWT parsed: sub=${decoded.sub}, ${decoded.expiresIn}`)

// Create an expired JWT (expired 1 hour ago)
const expiredJwtPayload = Buffer.from(JSON.stringify({
  sub: 'user_expired',
  exp: nowSec - 3600,
  iat: nowSec - 7200
})).toString('base64url')
const expiredJwt = `${validJwtHeader}.${expiredJwtPayload}.dummy_sig`

const decodedExpired = decodeJwtPayload(expiredJwt)
assert.equal(decodedExpired.valid, true)
assert.equal(decodedExpired.isExpired, true)
assert.ok(decodedExpired.expiresIn?.includes('Expired'), `Should indicate expired: ${decodedExpired.expiresIn}`)
console.log(`✔ 3b: Expired JWT correctly identified: ${decodedExpired.expiresIn}`)

console.log('\n--- [Test 4] Spec-Defined Scheme Display Formatters ---')

const bearerDisp = formatSchemeDisplay({
  name: 'BearerJwt',
  type: 'bearer',
  specType: 'http',
  bearerFormat: 'JWT',
  scopes: []
})
assert.equal(bearerDisp.typeLabel, 'HTTP Bearer (JWT)')
assert.equal(bearerDisp.placementLabel, 'Header (Authorization: Bearer <token>)')
console.log('✔ 4a: Bearer scheme display formatted correctly')

const apiKeyDisp = formatSchemeDisplay({
  name: 'ApiKeyAuth',
  type: 'apiKey',
  specType: 'apiKey',
  keyName: 'X-API-KEY',
  placement: 'header',
  scopes: []
})
assert.equal(apiKeyDisp.typeLabel, 'API Key')
assert.equal(apiKeyDisp.placementLabel, 'Header (X-API-KEY: ...)')
console.log('✔ 4b: API Key header scheme display formatted correctly')

const queryKeyDisp = formatSchemeDisplay({
  name: 'QueryApiKey',
  type: 'apiKey',
  specType: 'apiKey',
  keyName: 'api_token',
  placement: 'query',
  scopes: []
})
assert.equal(queryKeyDisp.typeLabel, 'API Key')
assert.equal(queryKeyDisp.placementLabel, 'Query Parameter (?api_token=...)')
console.log('✔ 4c: API Key query scheme display formatted correctly')

console.log('\n======================================================')
console.log(' ALL AUTH HANDLER UNIT & LOGIC TESTS PASSED SUCCESSFULLY! ')
console.log('======================================================')

