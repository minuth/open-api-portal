import { SpecParserService } from '../src/services/spec-parser'
import { LocalStorageProvider } from '../src/services/storage-service'
import { resolveEndpointSecurity } from '../src/utils/auth-metadata'
import { RequestPanel } from '../src/components/request-panel'
import { Header } from '../src/components/header'
import { jsx } from 'hono/jsx'

async function main() {
  console.log('======================================================')
  console.log('  TESTING SPEC-DRIVEN INTERACTIVE UI CONTROLS')
  console.log('======================================================\n')

  const parser = new SpecParserService()
  const storage = new LocalStorageProvider(parser, './storage/specs')

  const specs = await storage.listSpecs()
  console.log('Available specs in storage:', specs.map(s => ({ id: s.id, filename: s.filename })))

  // 1. Load Star Wars API (No Security Schemes)
  const swapiSpec = await storage.getSpec(specs.find(s => s.filename?.includes('StarWars'))?.id || 'OpenAPI-StarWars')
  if (!swapiSpec) throw new Error('Could not load OpenAPI-StarWars')

  // 2. Load Swagger Petstore (Has Security Schemes)
  const petstoreSpec = await storage.getSpec(specs.find(s => s.filename === 'openapi.yaml' || s.id === 'openapi')?.id || 'openapi')
  if (!petstoreSpec) throw new Error('Could not load openapi')

  console.log('--- [Test 1] Global Spec-Level Authorize Button in Header ---')
  const swapiHasSecuritySchemes = Boolean(swapiSpec.securitySchemes && Object.keys(swapiSpec.securitySchemes).length > 0)
  const petstoreHasSecuritySchemes = Boolean(petstoreSpec.securitySchemes && Object.keys(petstoreSpec.securitySchemes).length > 0)

  console.log(`Star Wars Spec Security Schemes: ${Object.keys(swapiSpec.securitySchemes || {}).length}`)
  console.log(`Petstore Spec Security Schemes: ${Object.keys(petstoreSpec.securitySchemes || {}).length}`)

  if (swapiHasSecuritySchemes) {
    throw new Error('FAIL: Star Wars API should NOT have security schemes')
  }
  console.log('✔ 1a: Star Wars API correctly identified as having NO security schemes')

  if (!petstoreHasSecuritySchemes) {
    throw new Error('FAIL: Petstore should have security schemes')
  }
  console.log('✔ 1b: Petstore API correctly identified as having security schemes')

  // Check header JSX rendering for Star Wars
  const swapiHeader = Header({
    activeSpecTitle: swapiSpec.title,
    hasActiveSpec: true,
    hasSecuritySchemes: swapiHasSecuritySchemes
  })
  const swapiHeaderHtml = String(swapiHeader)
  if (swapiHeaderHtml.includes('Authorize')) {
    throw new Error('FAIL: Star Wars header should NOT render Authorize button!')
  }
  console.log('✔ 1c: Star Wars header does NOT render the Authorize button')

  // Check header JSX rendering for Petstore
  const petstoreHeader = Header({
    activeSpecTitle: petstoreSpec.title,
    hasActiveSpec: true,
    hasSecuritySchemes: petstoreHasSecuritySchemes
  })
  const petstoreHeaderHtml = String(petstoreHeader)
  if (!petstoreHeaderHtml.includes('Authorize')) {
    throw new Error('FAIL: Petstore header SHOULD render Authorize button!')
  }
  console.log('✔ 1d: Petstore header DOES render the Authorize button')

  console.log('\n--- [Test 2] Endpoint-Level UI: Star Wars GET /movies (Zero Inputs Required) ---')
  const getMoviesEndpoint = swapiSpec.endpoints.find(e => e.path === '/movies' && e.method.toLowerCase() === 'get')
  if (!getMoviesEndpoint) throw new Error('Endpoint GET /movies not found')

  const getMoviesSecurity = resolveEndpointSecurity(getMoviesEndpoint, swapiSpec)
  if (getMoviesSecurity.isSecured) {
    throw new Error('FAIL: GET /movies should not be secured')
  }
  console.log('✔ 2a: GET /movies resolves as unsecured (Public)')

  const getMoviesPanel = RequestPanel({ spec: swapiSpec, endpoint: getMoviesEndpoint })
  const getMoviesHtml = String(getMoviesPanel)

  if (getMoviesHtml.includes('class="tab-bar"')) {
    throw new Error('FAIL: GET /movies should NOT render a tab-bar because it requires 0 inputs!')
  }
  if (!getMoviesHtml.includes('No Input Required')) {
    throw new Error('FAIL: GET /movies SHOULD render "No Input Required" card!')
  }
  if (getMoviesHtml.includes('>Auth<') || getMoviesHtml.includes('>Params<')) {
    throw new Error('FAIL: GET /movies should NOT render Auth or Params tabs!')
  }
  console.log('✔ 2b: GET /movies correctly renders "No Input Required" without unnecessary tabs')

  console.log('\n--- [Test 3] Endpoint-Level UI: Star Wars GET /movies/{movieId} (Path Param Only) ---')
  const getMovieByIdEndpoint = swapiSpec.endpoints.find(e => e.path === '/movies/{movieId}' && e.method.toLowerCase() === 'get')
  if (!getMovieByIdEndpoint) throw new Error('Endpoint GET /movies/{movieId} not found')

  const getMovieByIdPanel = RequestPanel({ spec: swapiSpec, endpoint: getMovieByIdEndpoint })
  const getMovieByIdHtml = String(getMovieByIdPanel)

  if (!getMovieByIdHtml.includes('<span>Params</span>') || !getMovieByIdHtml.includes('(1)')) {
    throw new Error('FAIL: GET /movies/{movieId} SHOULD render Params (1) tab!')
  }
  if (getMovieByIdHtml.includes('>Auth<')) {
    throw new Error('FAIL: GET /movies/{movieId} should NOT render Auth tab!')
  }
  if (getMovieByIdHtml.includes('>Body<')) {
    throw new Error('FAIL: GET /movies/{movieId} should NOT render Body tab!')
  }
  console.log('✔ 3: GET /movies/{movieId} renders ONLY Params (1) and omits Auth and Body tabs')

  console.log('\n--- [Test 4] Endpoint-Level UI: Petstore GET /store/inventory (Auth Only, No Params/Body) ---')
  const getInventoryEndpoint = petstoreSpec.endpoints.find(e => e.path === '/store/inventory' && e.method.toLowerCase() === 'get')
  if (!getInventoryEndpoint) throw new Error('Endpoint GET /store/inventory not found')

  const getInventoryPanel = RequestPanel({ spec: petstoreSpec, endpoint: getInventoryEndpoint })
  const getInventoryHtml = String(getInventoryPanel)

  if (!getInventoryHtml.includes('>Auth<')) {
    throw new Error('FAIL: GET /store/inventory SHOULD render Auth tab!')
  }
  if (getInventoryHtml.includes('>Params<') || getInventoryHtml.includes('>Body<')) {
    throw new Error('FAIL: GET /store/inventory should NOT render Params or Body tabs!')
  }
  console.log('✔ 4: GET /store/inventory renders ONLY Auth tab and omits Params and Body tabs')

  console.log('\n======================================================')
  console.log(' ALL SPEC-DRIVEN INTERACTIVE UI TESTS PASSED!')
  console.log('======================================================')
}

main().catch(err => {
  console.error('ERROR:', err)
  process.exit(1)
})
