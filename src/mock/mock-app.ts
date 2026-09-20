import fs from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { LoadedKeys } from './keys'
import { createAuthRoutes } from './routes/auth-routes'
import { createJwsRoutes } from './routes/jws-routes'
import { createJweRoutes } from './routes/jwe-routes'
import { createNestedRoutes } from './routes/nested-routes'
import { createPublicRoutes } from './routes/public-routes'
import { createPublicCatalogRoutes } from './routes/public-catalog-routes'
import { createEcommerceRoutes } from './routes/ecommerce-routes'
import { createAiPlatformRoutes } from './routes/ai-platform-routes'
import { createIotRoutes } from './routes/iot-routes'
import { createWebhookRoutes } from './routes/webhook-routes'
import { JoseValidationError } from './jose-validator'

/**
 * Copies all specifications from ./mock-api-spec into ./storage/specs
 */
export async function syncMockSpecs(
  sourceDir = './mock-api-spec',
  targetDir = './storage/specs'
): Promise<string[]> {
  const srcPath = path.resolve(process.cwd(), sourceDir)
  const dstPath = path.resolve(process.cwd(), targetDir)

  const copiedFiles: string[] = []

  try {
    const entries = await fs.readdir(srcPath, { withFileTypes: true })
    await fs.mkdir(dstPath, { recursive: true })

    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml') || entry.name.endsWith('.json'))) {
        const sourceFile = path.join(srcPath, entry.name)
        const targetFile = path.join(dstPath, entry.name)
        await fs.copyFile(sourceFile, targetFile)
        copiedFiles.push(entry.name)
      }
    }

    if (copiedFiles.length > 0) {
      console.log(`[Mock Server] Synced ${copiedFiles.length} mock spec(s) to ${targetDir}: ${copiedFiles.join(', ')}`)
    }
  } catch (err: unknown) {
    console.warn(`[Mock Server] Could not sync mock specs from ${sourceDir}:`, err)
  }

  return copiedFiles
}

/**
 * Creates and configures the Mock Server Hono application
 */
export function createMockApp(keys: LoadedKeys): Hono {
  const app = new Hono()

  // Mock Request Logger
  app.use('*', async (c, next) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    console.log(`[Mock Server] ${c.req.method} ${c.req.path} -> ${c.res.status} (${ms}ms)`)
  })

  // Global Error Handler for JOSE Validation Errors
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
  app.route('/', createPublicCatalogRoutes())
  app.route('/', createEcommerceRoutes())
  app.route('/', createAiPlatformRoutes())
  app.route('/', createIotRoutes())
  app.route('/', createWebhookRoutes())

  return app
}
