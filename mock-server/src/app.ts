import { Hono } from 'hono'
import { LoadedKeys } from './keys'
import { createJwsRoutes } from './routes/jws-routes'
import { createJweRoutes } from './routes/jwe-routes'
import { createNestedRoutes } from './routes/nested-routes'
import { createPublicRoutes } from './routes/public-routes'
import { createAuthRoutes } from './routes/auth-routes'
import { JoseValidationError } from './middleware/jose-validator'

export function createApp(keys: LoadedKeys): Hono {
  const app = new Hono()

  // Global Request Logger
  app.use('*', async (c, next) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    console.log(`[Mock Server] ${c.req.method} ${c.req.path} -> ${c.res.status} (${ms}ms)`)
  })

  // Global Error Handler
  app.onError((err, c) => {
    if (err instanceof JoseValidationError) {
      console.warn(`[Mock Server] [VALIDATION FAILED] ${c.req.path}: ${err.message}`)
      return c.json(
        {
          error: 'JOSE_VALIDATION_FAILED',
          message: err.message,
          endpoint: c.req.path,
          method: c.req.method
        },
        err.statusCode as 400 | 401 | 422
      )
    }

    console.error(`[Mock Server] [ERROR] Unhandled exception:`, err)
    return c.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : String(err)
      },
      500
    )
  })

  // Mount Route Modules
  app.route('/', createAuthRoutes(keys))
  app.route('/', createJwsRoutes(keys))
  app.route('/', createJweRoutes(keys))
  app.route('/', createNestedRoutes(keys))
  app.route('/', createPublicRoutes(keys))

  return app
}
