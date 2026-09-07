import { Hono } from 'hono'
import { jsx } from 'hono/jsx'
import { Layout } from '../components/layout'
import { SpecSidebar } from '../components/spec-sidebar'
import { SpecDetail } from '../components/spec-detail'
import { EmptyState } from '../components/empty-state'
import { localStorageProvider, memoryStorageProvider, scmService } from '../services/storage-instances'
import { OpenApiDocument } from '../types/openapi'
import { SpecList } from '../components/spec-list'
import { AlertBox } from '../components/alert-box'
import { GitSourceRecord, GitTokenRecord, UserRecord } from '../db/schema'
import { logServerError } from '../utils/logger'

import { userService } from '../services/user-service'

export const specsApp = new Hono()

async function getSpecFromAnyProvider(id: string, userId?: string): Promise<OpenApiDocument | null> {
  const localSpec = await localStorageProvider.getSpec(id)
  if (localSpec) return localSpec
  return await memoryStorageProvider.getSpec(id, userId)
}

async function getAllSpecs(userId?: string) {
  const localSpecs = await localStorageProvider.listSpecs(userId)
  const memorySpecs = await memoryStorageProvider.listSpecs(userId)
  return [...localSpecs, ...memorySpecs]
}

async function getGitSourcesMap(): Promise<Record<string, GitSourceRecord>> {
  try {
    const sources = scmService.listGitSources()
    const map: Record<string, GitSourceRecord> = {}
    for (const s of sources) {
      map[s.cachedSpecId] = s
    }
    return map
  } catch {
    return {}
  }
}

function getTokens(): GitTokenRecord[] {
  try {
    return scmService.listTokens()
  } catch {
    return []
  }
}

function getAllUsers(currentUserRole?: string): UserRecord[] {
  if (currentUserRole !== 'admin') return []
  try {
    return userService.listUsers()
  } catch {
    return []
  }
}

// 1. View specifications manager page (list of all specs)
specsApp.get('/specs', async (c) => {
  const currentUser = c.get('user')
  const specs = await getAllSpecs(currentUser?.id)
  const gitSources = await getGitSourcesMap()
  const tokens = getTokens()
  const allUsers = getAllUsers(currentUser?.role)

  return c.html(
    <Layout title="All Specifications - Open API Portal" tokens={tokens} user={currentUser} allUsers={allUsers}>
      <div class="portal-container">
        <div class="portal-container-inner">
          <SpecList specs={specs} gitSources={gitSources} />
        </div>
      </div>
    </Layout>
  )
})

// 2. View main spec portal page by ID
specsApp.get('/specs/:id', async (c) => {
  const currentUser = c.get('user')
  const specId = c.req.param('id')
  const spec = await getSpecFromAnyProvider(specId, currentUser?.id)
  const allSpecs = await getAllSpecs(currentUser?.id)
  const tokens = getTokens()
  const allUsers = getAllUsers(currentUser?.role)

  if (!spec) {
    return c.html(
      <Layout title="Spec Not Found" tokens={tokens} user={currentUser} allUsers={allUsers}>
        <EmptyState
          title="Specification Not Found"
          subtitle="The requested OpenAPI specification could not be located."
          showUpload={false}
        />
      </Layout>
    )
  }

  const requestedEndpointId = c.req.query('endpoint') || c.req.query('operationId')
  const activeEndpoint = (requestedEndpointId
    ? spec.endpoints.find(
        (e) =>
          e.id.toLowerCase() === requestedEndpointId.toLowerCase() ||
          e.path.toLowerCase() === requestedEndpointId.toLowerCase()
      )
    : undefined) || spec.endpoints[0]

  return c.html(
    <Layout
      title={`${spec.title} - Open API Portal`}
      activeSpecTitle={spec.title}
      activeSpecVersion={spec.version}
      tokens={tokens}
      user={currentUser}
      allUsers={allUsers}
    >
      <div class="portal-workspace">
        <SpecSidebar
          specs={allSpecs}
          activeSpecId={spec.id}
          endpoints={spec.endpoints}
          tags={spec.tags}
          activeEndpointId={activeEndpoint?.id}
        />
        <div id="spec-detail-container" class="main-content">
          {activeEndpoint ? (
            <SpecDetail spec={spec} endpoint={activeEndpoint} />
          ) : (
            <div class="welcome-subtitle">
              No endpoints defined in this specification.
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
})

// 3. Select Spec Dropdown handler
specsApp.get('/specs/select', async (c) => {
  const specId = c.req.query('specId')
  if (!specId) {
    return c.redirect('/')
  }
  return c.redirect(`/specs/${encodeURIComponent(specId)}`)
})

// 4. HTMX Endpoint Detail Partial Handler
specsApp.get('/api/specs/endpoint', async (c) => {
  const currentUser = c.get('user')
  const specId = c.req.query('specId')
  const operationId = c.req.query('operationId')

  if (!specId || !operationId) {
    return c.html(
      <div class="alert-error" role="alert">
        Missing specId or operationId parameter.
      </div>
    )
  }

  const spec = await getSpecFromAnyProvider(specId, currentUser?.id)
  if (!spec) {
    return c.html(
      <div class="alert-error" role="alert">
        Specification not found.
      </div>
    )
  }

  const endpoint = spec.endpoints.find(
    (e) =>
      e.id.toLowerCase() === operationId.toLowerCase() ||
      e.path.toLowerCase() === operationId.toLowerCase()
  )
  if (!endpoint) {
    return c.html(
      <div class="alert-error" role="alert">
        Endpoint operation not found.
      </div>
    )
  }

  return c.html(<SpecDetail spec={spec} endpoint={endpoint} />)
})

// 5. Delete Spec Partial Handler
specsApp.delete('/api/specs/:id', async (c) => {
  const currentUser = c.get('user')
  const specId = c.req.param('id')

  if (!specId) {
    return c.html(<AlertBox title="Delete Failed" message="Invalid specification ID." />, 400)
  }

  try {
    const isSharedSpec = (await localStorageProvider.getSpec(specId)) !== null

    // Viewer role cannot delete shared project specs
    if (isSharedSpec && currentUser?.role === 'viewer') {
      return c.html(
        <AlertBox
          title="Access Denied"
          message="Viewers cannot delete shared project specifications."
        />,
        403
      )
    }

    const localDeleted = await localStorageProvider.deleteSpec(specId)
    const memoryDeleted = await memoryStorageProvider.deleteSpec(specId, currentUser?.id)

    if (!localDeleted && !memoryDeleted) {
      return c.html(<AlertBox title="Delete Failed" message="Specification was not found or could not be deleted." />, 404)
    }

    const remainingSpecs = await getAllSpecs(currentUser?.id)
    const gitSources = await getGitSourcesMap()
    return c.html(<SpecList specs={remainingSpecs} gitSources={gitSources} />)
  } catch (err) {
    logServerError(`DELETE /api/specs/${specId}`, err)
    const message = err instanceof Error ? err.message : String(err)
    return c.html(<AlertBox title="Delete Failed" message={message} />, 400)
  }
})

