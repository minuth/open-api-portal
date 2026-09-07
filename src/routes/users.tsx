import { Hono } from 'hono'
import { jsx } from 'hono/jsx'
import { userService } from '../services/user-service'
import { requireRole } from '../utils/auth-middleware'
import { UserRole } from '../db/schema'
import { AlertBox } from '../components/alert-box'
import { IconShield } from '../components/icons'

export const usersApp = new Hono()

// All user management routes require admin role
usersApp.use('*', requireRole('admin'))

// List all users HTML table partial
usersApp.get('/api/users', (c) => {
  const usersList = userService.listUsers()
  return c.html(
    <div class="user-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Role</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>
          {usersList.map((u) => (
            <tr>
              <td class="font-mono">{u.username}</td>
              <td>{u.email}</td>
              <td>
                <span class={`role-badge role-badge-${u.role}`}>
                  <IconShield width={12} height={12} /> {u.role.toUpperCase()}
                </span>
              </td>
              <td class="font-mono text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

// Invite / create user endpoint
usersApp.post('/api/users/invite', async (c) => {
  try {
    const body = await c.req.parseBody()
    const username = (body['username'] as string || '').trim()
    const email = (body['email'] as string || '').trim()
    const role = (body['role'] as UserRole) || 'viewer'
    const password = (body['password'] as string || '').trim()

    if (!username || !email || !password) {
      return c.html(
        <AlertBox title="Invite Failed" message="All fields (username, email, role, password) are required." />,
        400
      )
    }

    if (!['admin', 'editor', 'viewer'].includes(role)) {
      return c.html(<AlertBox title="Invite Failed" message="Invalid role selected." />, 400)
    }

    const newUser = userService.createUser({ username, email, role, password })

    return c.html(
      <div class="alert-success" role="alert">
        User <strong>{newUser.username}</strong> ({newUser.role}) successfully created! Initial login credentials ready.
      </div>
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return c.html(<AlertBox title="Invite Error" message={message} />, 400)
  }
})
