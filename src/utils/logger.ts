import { MiddlewareHandler } from 'hono'

/**
 * Custom console logger middleware for Hono
 * Formats timestamps, HTTP method, URL, status code, and response latency.
 */
export const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  const start = performance.now()
  const method = c.req.method
  const path = c.req.path
  const timestamp = new Date().toISOString()

  await next()

  const ms = Math.round(performance.now() - start)
  const status = c.res.status

  const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : status >= 300 ? '\x1b[36m' : '\x1b[32m'
  const reset = '\x1b[0m'

  console.log(`[${timestamp}] ${method} ${path} - ${statusColor}${status}${reset} (${ms}ms)`)
}

/**
 * Console error logger for server & domain errors
 */
export function logServerError(action: string, error: unknown): void {
  const timestamp = new Date().toISOString()
  const msg = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error && error.stack ? `\n${error.stack}` : ''

  console.error(`\x1b[31m[${timestamp}] [ERROR] [${action}]: ${msg}${stack}\x1b[0m`)
}
