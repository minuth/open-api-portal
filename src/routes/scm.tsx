import { Hono } from 'hono'
import { jsx } from 'hono/jsx'
import { scmService, localStorageProvider } from '../services/storage-instances'
import { AlertBox } from '../components/alert-box'
import { InvalidSpecError, StorageError } from '../types/errors'
import { logServerError } from '../utils/logger'

import { requireRole } from '../utils/auth-middleware'

export const scmApp = new Hono()

// SCM import, token configuration, and git sync require admin or editor role
scmApp.use('*', requireRole('admin', 'editor'))


// 1. Import OpenAPI Spec from GitHub or GitLab SCM
scmApp.post('/api/scm/import', async (c) => {
  try {
    const body = await c.req.parseBody()
    const repoUrl = ((body['repoUrl'] as string) || '').trim()
    const filePath = ((body['filePath'] as string) || '').trim()
    const branch = ((body['branch'] as string) || 'main').trim()
    const provider = (body['provider'] as 'github' | 'gitlab' | 'auto') || 'auto'
    const tokenId = ((body['tokenId'] as string) || '').trim()
    const newToken = ((body['newToken'] as string) || '').trim()
    const newTokenName = ((body['newTokenName'] as string) || '').trim()
    const name = ((body['name'] as string) || '').trim()

    if (!repoUrl) {
      return c.html(
        <AlertBox title="Import Failed" message="Repository URL or owner/repo path is required." />,
        400
      )
    }

    if (!filePath) {
      return c.html(
        <AlertBox title="Import Failed" message="File path in repository is required." />,
        400
      )
    }

    const { doc } = await scmService.importFromScm({
      name,
      provider,
      repoUrl,
      filePath,
      branch,
      tokenId: tokenId || undefined,
      newToken: newToken || undefined,
      newTokenName: newTokenName || undefined
    })

    // Also persist fetched raw YAML to local storage provider
    await localStorageProvider.saveSpec(`${doc.id}.yaml`, doc.rawYaml)

    c.header('HX-Redirect', `/specs/${encodeURIComponent(doc.id)}`)
    return c.text('SCM Import Successful')
  } catch (err: unknown) {
    logServerError('POST /api/scm/import', err)

    const message = err instanceof Error ? err.message : String(err)
    let title = 'SCM Import Error'
    if (err instanceof InvalidSpecError) {
      title = 'Invalid Specification / File Error'
    } else if (err instanceof StorageError) {
      title = 'Network or Storage Error'
    }

    return c.html(<AlertBox title={title} message={message} />, 400)
  }
})

// 2. Sync / Refresh spec from GitHub or GitLab SCM
scmApp.post('/api/scm/sync/:id', async (c) => {
  const specId = c.req.param('id')
  if (!specId) {
    return c.html(<AlertBox title="Sync Failed" message="Missing spec ID." />, 400)
  }

  try {
    const { doc } = await scmService.syncSpec(specId)

    // Update saved YAML in local storage
    await localStorageProvider.saveSpec(`${doc.id}.yaml`, doc.rawYaml)

    c.header('HX-Redirect', `/specs/${encodeURIComponent(doc.id)}`)
    return c.text('Sync Successful')
  } catch (err: unknown) {
    logServerError(`POST /api/scm/sync/${specId}`, err)

    const message = err instanceof Error ? err.message : String(err)
    return c.html(<AlertBox title="Sync Failed" message={message} />, 400)
  }
})

// 3. Create or Update AES-256 encrypted PAT token
scmApp.post('/api/scm/tokens', async (c) => {
  try {
    const body = await c.req.parseBody()
    const tokenId = ((body['tokenId'] as string) || '').trim()
    const name = ((body['name'] as string) || '').trim()
    const provider = (body['provider'] as 'github' | 'gitlab') || 'github'
    const rawToken = ((body['rawToken'] as string) || '').trim()

    if (!name) {
      return c.html(
        <AlertBox title="Token Operation Failed" message="Token label name is required." />,
        400
      )
    }

    if (tokenId) {
      scmService.updateToken(tokenId, name, provider, rawToken || undefined)
    } else {
      if (!rawToken) {
        return c.html(
          <AlertBox title="Token Creation Failed" message="Token secret is required for new tokens." />,
          400
        )
      }
      scmService.createToken(name, provider, rawToken)
    }

    const referer = c.req.header('Referer') || '/specs'
    c.header('HX-Redirect', referer)
    return c.text('Token Saved Successfully')
  } catch (err: unknown) {
    logServerError('POST /api/scm/tokens', err)

    const message = err instanceof Error ? err.message : String(err)
    return c.html(<AlertBox title="Token Error" message={message} />, 400)
  }
})

// 4. Update saved token by ID
scmApp.post('/api/scm/tokens/:id', async (c) => {
  const tokenId = c.req.param('id')
  if (!tokenId) {
    return c.html(<AlertBox title="Update Failed" message="Missing token ID." />, 400)
  }

  try {
    const body = await c.req.parseBody()
    const name = ((body['name'] as string) || '').trim()
    const provider = (body['provider'] as 'github' | 'gitlab') || 'github'
    const rawToken = ((body['rawToken'] as string) || '').trim()

    if (!name) {
      return c.html(
        <AlertBox title="Token Update Failed" message="Token label name is required." />,
        400
      )
    }

    scmService.updateToken(tokenId, name, provider, rawToken || undefined)

    const referer = c.req.header('Referer') || '/specs'
    c.header('HX-Redirect', referer)
    return c.text('Token Updated Successfully')
  } catch (err: unknown) {
    logServerError(`POST /api/scm/tokens/${tokenId}`, err)

    const message = err instanceof Error ? err.message : String(err)
    return c.html(<AlertBox title="Token Update Error" message={message} />, 400)
  }
})

// 5. Delete saved token
scmApp.delete('/api/scm/tokens/:id', async (c) => {
  const tokenId = c.req.param('id')
  if (!tokenId) {
    return c.html(<AlertBox title="Delete Failed" message="Missing token ID." />, 400)
  }

  try {
    scmService.deleteToken(tokenId)

    const referer = c.req.header('Referer') || '/specs'
    c.header('HX-Redirect', referer)
    return c.text('Token Deleted Successfully')
  } catch (err: unknown) {
    logServerError(`DELETE /api/scm/tokens/${tokenId}`, err)

    const message = err instanceof Error ? err.message : String(err)
    return c.html(<AlertBox title="Token Delete Error" message={message} />, 400)
  }
})
