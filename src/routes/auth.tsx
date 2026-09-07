import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { jsx } from 'hono/jsx'
import { authService } from '../services/auth-service'
import { LoginPage } from '../components/login-page'
import { SESSION_COOKIE_NAME } from '../utils/auth-middleware'

export const authApp = new Hono()

authApp.get('/login', (c) => {
  const currentUser = c.get('user')
  if (currentUser) {
    return c.redirect('/')
  }
  return c.html(<LoginPage />)
})

authApp.post('/api/login', async (c) => {
  const body = await c.req.parseBody()
  const username = (body['username'] as string) || ''
  const password = (body['password'] as string) || ''

  if (!username || !password) {
    return c.html(<LoginPage error="Please provide both username and password." />, 400)
  }

  const user = authService.authenticate(username, password)
  if (!user) {
    return c.html(<LoginPage error="Invalid username or password." />, 401)
  }

  const session = authService.createSession(user.id)
  setCookie(c, SESSION_COOKIE_NAME, session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: new Date(session.expiresAt)
  })

  return c.redirect('/')
})

authApp.post('/api/logout', (c) => {
  const sessionId = c.req.header('cookie')?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1]
  if (sessionId) {
    authService.revokeSession(sessionId)
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
  return c.redirect('/login')
})
