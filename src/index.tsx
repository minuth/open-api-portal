import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { jsx } from 'hono/jsx'
import { specsApp } from './routes/specs'
import { uploadApp } from './routes/upload'
import { proxyApp } from './routes/proxy'
import { scmApp } from './routes/scm'
import { authApp } from './routes/auth'
import { usersApp } from './routes/users'
import { settingsApp } from './routes/settings'
import { shareApp } from './routes/share'
import { initDatabase } from './db/client'
import { userService } from './services/user-service'
import { localStorageProvider, memoryStorageProvider, scmService } from './services/storage-instances'
import { Layout } from './components/layout'
import { EmptyState } from './components/empty-state'
import { AlertBox } from './components/alert-box'
import { GitTokenRecord, UserRecord } from './db/schema'
import { loggerMiddleware, logServerError } from './utils/logger'
import { authMiddleware, requireAuth } from './utils/auth-middleware'

// Initialize database schema & migrations
initDatabase()

// Seed default initial admin account if no users exist
userService.seedInitialAdmin()

const app = new Hono()

// Request console logger middleware
app.use('*', loggerMiddleware)

// Serve static assets (CSS, JS, Favicon)
app.use('/public/*', serveStatic({ root: './' }))
app.use('/favicon.svg', serveStatic({ path: './public/favicon.svg' }))
app.use('/favicon.ico', serveStatic({ path: './public/favicon.svg' }))

// Global Auth Middleware (Attaches logged-in user to context)
app.use('*', authMiddleware)

// Mount Public Auth Routes
app.route('/', authApp)

// Health Check Route
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'open-api-portal' })
})

// Protect all remaining routes with authentication
app.use('/settings', requireAuth)
app.use('/specs', requireAuth)
app.use('/specs/*', requireAuth)
app.use('/api/specs/*', requireAuth)
app.use('/api/upload', requireAuth)
app.use('/api/proxy', requireAuth)
app.use('/api/scm/*', requireAuth)
app.use('/api/users', requireAuth)
app.use('/api/users/*', requireAuth)
app.use('/api/share/*', requireAuth)

// Mount Protected Controllers
app.route('/', specsApp)
app.route('/', uploadApp)
app.route('/', proxyApp)
app.route('/', scmApp)
app.route('/', usersApp)
app.route('/', settingsApp)
app.route('/', shareApp)

// Default Root Route
app.get('/', requireAuth, async (c) => {
  const currentUser = c.get('user')
  const localSpecs = await localStorageProvider.listSpecs(currentUser?.id)
  const memorySpecs = await memoryStorageProvider.listSpecs(currentUser?.id)
  const allSpecs = [...localSpecs, ...memorySpecs]

  if (allSpecs.length > 0) {
    return c.redirect(`/specs/${encodeURIComponent(allSpecs[0].id)}`)
  }

  let tokens: GitTokenRecord[] = []
  try {
    tokens = scmService.listTokens()
  } catch {
    tokens = []
  }

  let allUsers: UserRecord[] = []
  if (currentUser?.role === 'admin') {
    try {
      allUsers = userService.listUsers()
    } catch {
      allUsers = []
    }
  }

  return c.html(
    <Layout
      title="Open API Portal"
      tokens={tokens}
      user={currentUser}
      allUsers={allUsers}
      allSpecs={allSpecs}
    >
      <EmptyState />
    </Layout>
  )
})

const port = Number(process.env.PORT) || 3000
console.log(`Open API Portal server running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})

