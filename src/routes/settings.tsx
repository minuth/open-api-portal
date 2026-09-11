import { Hono } from 'hono'
import { jsx } from 'hono/jsx'
import { Layout } from '../components/layout'
import { SettingsPage } from '../components/settings-page'
import { scmService } from '../services/storage-instances'
import { userService } from '../services/user-service'
import { GitTokenRecord, UserRecord } from '../db/schema'

export const settingsApp = new Hono()

settingsApp.get('/settings', async (c) => {
  const currentUser = c.get('user')
  const initialTab = c.req.query('tab') || 'account'

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
      title="Settings - Open API Portal"
      user={currentUser}
      tokens={tokens}
      allUsers={allUsers}
    >
      <SettingsPage
        user={currentUser}
        tokens={tokens}
        users={allUsers}
        initialTab={initialTab}
      />
    </Layout>
  )
})
