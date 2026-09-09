import assert from 'node:assert/strict'
import { proxyApp } from '../src/routes/proxy'

async function run() {
  console.log('Testing proxyApp with authJson payload...')

  // Test 1: Bearer Auth in proxyApp
  const formData = new FormData()
  formData.append('baseUrl', 'http://localhost:4000')
  formData.append('pathTemplate', '/api/v1/health')
  formData.append('method', 'GET')
  formData.append('authJson', JSON.stringify({
    type: 'bearer',
    token: 'test-token-123',
    bearerPrefix: 'Bearer'
  }))

  const res = await proxyApp.request('/api/proxy', {
    method: 'POST',
    body: formData
  })

  assert.equal(res.status, 200, `Expected 200 status, got ${res.status}`)
  const html = await res.text()

  // The ResponsePanel displays the cURL preview of the actual dispatched request
  // Check if "Authorization: Bearer test-token-123" is in the cURL output
  assert.ok(html.includes('Authorization: Bearer test-token-123'), 'cURL command should contain Authorization: Bearer header')
  console.log('✔ Proxy successfully injected Bearer Authorization header into request & cURL preview')

  // Test 2: Basic Auth in proxyApp
  const formBasic = new FormData()
  formBasic.append('baseUrl', 'http://localhost:4000')
  formBasic.append('pathTemplate', '/api/v1/health')
  formBasic.append('method', 'GET')
  formBasic.append('authJson', JSON.stringify({
    type: 'basic',
    username: 'myuser',
    password: 'mypassword'
  }))

  const resBasic = await proxyApp.request('/api/proxy', {
    method: 'POST',
    body: formBasic
  })

  assert.equal(resBasic.status, 200)
  const htmlBasic = await resBasic.text()
  const expectedB64 = Buffer.from('myuser:mypassword').toString('base64')
  assert.ok(htmlBasic.includes(`Authorization: Basic ${expectedB64}`), 'cURL command should contain Basic auth')
  console.log(`✔ Proxy successfully injected Basic Authorization header (${expectedB64})`)

  // Test 3: API Key in Query in proxyApp
  const formKey = new FormData()
  formKey.append('baseUrl', 'http://localhost:4000')
  formKey.append('pathTemplate', '/api/v1/health')
  formKey.append('method', 'GET')
  formKey.append('authJson', JSON.stringify({
    type: 'apiKey',
    apiKeyName: 'api_token',
    apiKeyValue: 'token_xyz_99',
    apiKeyPlacement: 'query'
  }))

  const resKey = await proxyApp.request('/api/proxy', {
    method: 'POST',
    body: formKey
  })

  assert.equal(resKey.status, 200)
  const htmlKey = await resKey.text()
  assert.ok(htmlKey.includes('api_token=token_xyz_99'), 'Target URL in cURL should include api_token query param')
  console.log('✔ Proxy successfully appended API Key query parameter to target request & cURL preview')

  console.log('\n======================================================')
  console.log(' ALL PROXY AUTH DISPATCH INTEGRATION TESTS PASSED! ')
  console.log('======================================================')
}

run().catch((err) => {
  console.error('Error during proxy auth test:', err)
  process.exit(1)
})
