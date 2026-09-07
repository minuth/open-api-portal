import { serve } from '@hono/node-server'
import { loadMockKeys } from './keys'
import { createApp } from './app'

async function bootstrap() {
  console.log('[Mock Server] Initializing mock cryptographic engine & loading real test keys...')
  const keys = await loadMockKeys()
  console.log('[Mock Server] Keys loaded: RSA-2048, ECDSA P-256, HMAC Symmetric-256.')

  const app = createApp(keys)
  const port = parseInt(process.env.MOCK_PORT || '4000', 10)
  console.log(`[Mock Server] Running on http://localhost:${port}`)
  console.log(`[Mock Server] Ready to validate real JWS/JWE payloads for openapi-jose-demo.yaml`)

  serve({
    fetch: app.fetch,
    port
  })
}

bootstrap().catch((err) => {
  console.error('[Mock Server] Startup failure:', err)
  process.exit(1)
})
