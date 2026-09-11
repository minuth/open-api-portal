import { Hono } from 'hono'
import { jsx } from 'hono/jsx'
import { Layout } from '../components/layout'
import { SettingsPage } from '../components/settings-page'
import { scmService, localStorageProvider, memoryStorageProvider } from '../services/storage-instances'
import { userService } from '../services/user-service'
import { shareService, SharedLinkWithCreator } from '../services/share-service'
import { GitTokenRecord, UserRecord } from '../db/schema'
import { SpecSummary } from '../types/openapi'

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

  let sharedLinks: SharedLinkWithCreator[] = []
  let allSpecs: SpecSummary[] = []
  if (currentUser?.role === 'admin' || currentUser?.role === 'editor') {
    try {
      sharedLinks = shareService.listSharedLinks()
    } catch {
      sharedLinks = []
    }

    try {
      const localSpecs = await localStorageProvider.listSpecs(currentUser.id)
      const memSpecs = await memoryStorageProvider.listSpecs(currentUser.id)
      allSpecs = [...localSpecs, ...memSpecs]
    } catch {
      allSpecs = []
    }
  }

  return c.html(
    <Layout
      title="Settings - Open API Portal"
      user={currentUser}
      tokens={tokens}
      allUsers={allUsers}
      allSpecs={allSpecs}
    >
      <SettingsPage
        user={currentUser}
        tokens={tokens}
        users={allUsers}
        sharedLinks={sharedLinks}
        initialTab={initialTab}
      />
    </Layout>
  )
})
