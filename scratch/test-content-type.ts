import fs from 'node:fs'
import { SpecParserService } from '../src/services/spec-parser'
import { normalizeUrlEncodedBody } from '../src/routes/proxy'
import { proxyApp } from '../src/routes/proxy'

async function run() {
  console.log('--- Testing normalizeUrlEncodedBody ---')
  // 1. JSON to urlencoded
  const jsonInput = JSON.stringify({ grant_type: 'password', username: 'admin', count: 42 })
  const normalizedFromJson = normalizeUrlEncodedBody(jsonInput)
  console.log('Normalized from JSON:', normalizedFromJson)
  if (normalizedFromJson !== 'grant_type=password&username=admin&count=42') {
    throw new Error(`JSON conversion failed: got ${normalizedFromJson}`)
  }

  // 2. Multiline to urlencoded
  const multilineInput = 'grant_type=password\nusername=admin\nclient_id=123'
  const normalizedFromLines = normalizeUrlEncodedBody(multilineInput)
  console.log('Normalized from multiline:', normalizedFromLines)
  if (normalizedFromLines !== 'grant_type=password&username=admin&client_id=123') {
    throw new Error(`Multiline conversion failed: got ${normalizedFromLines}`)
  }

  // 3. Already urlencoded
  const directInput = 'grant_type=client_credentials&client_id=finsecure-partner-portal-01'
  const normalizedDirect = normalizeUrlEncodedBody(directInput)
  console.log('Normalized direct:', normalizedDirect)
  if (normalizedDirect !== directInput) {
    throw new Error(`Direct preservation failed: got ${normalizedDirect}`)
  }

  console.log('--- Testing Spec Parsing ---')
  const parser = new SpecParserService()
  const yamlContent = fs.readFileSync('storage/specs/openapi-jose-demo.yaml', 'utf8')
  const doc = await parser.parseYaml(yamlContent, 'demo-spec', 'openapi-jose-demo.yaml')
  const tokenEndpoint = doc.endpoints.find(e => e.path === '/api/v1/auth/token')
  if (!tokenEndpoint) throw new Error('Token endpoint not found')

  const contentKeys = Object.keys(tokenEndpoint.requestBody?.content || {})
  console.log('Token endpoint content keys:', contentKeys)
  if (!contentKeys.includes('application/x-www-form-urlencoded') || !contentKeys.includes('application/json')) {
    throw new Error('Missing expected content keys in parsed spec')
  }

  console.log('--- Testing Proxy Route Content-Type Header Processing ---')
  // Send simulated request to proxyApp
  const formData = new FormData()
  formData.append('baseUrl', 'http://localhost:4000')
  formData.append('pathTemplate', '/api/v1/auth/token')
  formData.append('method', 'POST')
  formData.append('contentType', 'application/x-www-form-urlencoded')
  formData.append('body', '{"grant_type":"client_credentials","client_id":"finsecure-partner-portal-01"}')
  formData.append('headersJson', '[]')
  formData.append('queryParamsJson', '[]')
  formData.append('pathParamsJson', '{}')

  const proxyRes = await proxyApp.request('/api/proxy', {
    method: 'POST',
    body: formData
  })

  const html = await proxyRes.text()
  console.log('Proxy status:', proxyRes.status)
  if (!html.includes('application/x-www-form-urlencoded')) {
    throw new Error('Proxy output did not reflect application/x-www-form-urlencoded content type')
  }
  console.log('Proxy HTML includes application/x-www-form-urlencoded!')
  console.log('SUCCESS! All content type handling tests passed!')
}

run().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
