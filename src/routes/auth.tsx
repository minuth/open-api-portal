import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { jsx } from 'hono/jsx'
import { authService } from '../services/auth-service'
import { userService } from '../services/user-service'
import { LoginPage } from '../components/login-page'
import { AlertBox } from '../components/alert-box'
import { SESSION_COOKIE_NAME, requireAuth } from '../utils/auth-middleware'

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

authApp.post('/api/auth/change-password', requireAuth, async (c) => {
  const currentUser = c.get('user')
  if (!currentUser) {
    return c.html(<AlertBox title="Unauthorized" message="Please log in first." />, 401)
  }

  try {
    const body = await c.req.parseBody()
    const currentPassword = ((body['currentPassword'] as string) || '').trim()
    const newPassword = ((body['newPassword'] as string) || '').trim()
    const confirmPassword = ((body['confirmPassword'] as string) || '').trim()

    if (!currentPassword) {
      return c.html(
        <AlertBox title="Validation Error" message="Current password is required." />,
        400
      )
    }

    if (!newPassword) {
      return c.html(
        <AlertBox title="Validation Error" message="New password is required." />,
        400
      )
    }

    if (newPassword.length < 6) {
      return c.html(
        <AlertBox title="Validation Error" message="New password must be at least 6 characters long." />,
        400
      )
    }

    if (!confirmPassword) {
      return c.html(
        <AlertBox title="Validation Error" message="Please confirm your new password." />,
        400
      )
    }

    if (newPassword !== confirmPassword) {
      return c.html(
        <AlertBox title="Validation Error" message="New passwords do not match. Please verify both fields." />,
        400
      )
    }

    if (currentPassword === newPassword) {
      return c.html(
        <AlertBox title="Validation Error" message="New password must be different from your current password." />,
        400
      )
    }

    userService.updatePassword(currentUser.id, currentPassword, newPassword)

    return c.html(
      <div class="alert-success" role="alert">
        Password changed successfully.
      </div>
    )
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : String(err)
    const message = rawMessage.replace(/^Storage\s*Error:\s*/i, '')
    return c.html(<AlertBox title="Update Failed" message={message} />, 400)
  }
})
