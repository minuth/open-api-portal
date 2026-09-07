import { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { jsx } from 'hono/jsx'
import { authService } from '../services/auth-service'
import { UserRecord, UserRole } from '../db/schema'
import { AlertBox } from '../components/alert-box'

declare module 'hono' {
  interface ContextVariableMap {
    user: UserRecord | null
  }
}

export const SESSION_COOKIE_NAME = 'portal_session'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME)
  if (sessionId) {
    const result = authService.getSessionWithUser(sessionId)
    if (result) {
      c.set('user', result.user)
    } else {
      c.set('user', null)
    }
  } else {
    c.set('user', null)
  }
  await next()
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get('user')
  if (!user) {
    if (c.req.header('HX-Request')) {
      c.header('HX-Redirect', '/login')
      return c.text('Unauthorized', 401)
    }
    return c.redirect('/login')
  }
  await next()
}

export function requireRole(...allowedRoles: UserRole[]): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) {
      if (c.req.header('HX-Request')) {
        c.header('HX-Redirect', '/login')
        return c.text('Unauthorized', 401)
      }
      return c.redirect('/login')
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
      if (c.req.header('HX-Request')) {
        return c.html(
          <AlertBox
            title="Access Denied"
            message={`Your role (${user.role}) does not have permission to perform this action.`}
          />,
          403
        )
      }
      return c.html(
        <AlertBox
          title="Access Denied"
          message={`Your role (${user.role}) does not have permission to access this page.`}
        />,
        403
      )
    }

    await next()
  }
}
