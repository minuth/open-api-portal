import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { jsx } from 'hono/jsx'
import { shareService, SharedLinkWithCreator, parseSpecIds } from '../services/share-service'
import { localStorageProvider, memoryStorageProvider } from '../services/storage-instances'
import { Layout } from '../components/layout'
import { SpecSidebar } from '../components/spec-sidebar'
import { SpecDetail } from '../components/spec-detail'
import { EmptyState } from '../components/empty-state'
import { ShareResultCard } from '../components/share-modal'
import { AlertBox } from '../components/alert-box'
import { IconCopy, IconCheck, IconTrash, IconLink } from '../components/icons'
import { logServerError } from '../utils/logger'
import { OpenApiDocument, SpecSummary } from '../types/openapi'

export const shareApp = new Hono()

/**
 * Shared Links Table Partial Presenter (Used in Settings and for HTMX updates)
 */
export const SharedLinksTableContent = ({ links }: { links: SharedLinkWithCreator[] }) => {
  if (links.length === 0) {
    return (
      <div class="settings-empty-state">
        <p>No public share links generated yet.</p>
      </div>
    )
  }

  const allIdsJson = JSON.stringify(links.map((l) => l.id))

  return (
    <div
      class="settings-table-wrapper"
      x-data={`{
        allIds: ${allIdsJson},
        selectedIds: [],
        toggleAll() {
          if (this.selectedIds.length === this.allIds.length) {
            this.selectedIds = [];
          } else {
            this.selectedIds = [...this.allIds];
          }
        }
      }`}
    >
      {/* Multi-Select Floating / Embedded Actions Bar */}
      <div
        x-show="selectedIds.length > 0"
        x-cloak
        class="shared-selection-bar"
      >
        <div class="shared-selection-count font-xs">
          <span class="font-semibold text-main" x-text="selectedIds.length"></span>
          <span class="text-muted" x-text="selectedIds.length === 1 ? ' link selected' : ' links selected'"></span>
        </div>
        <div class="shared-selection-actions">
          <button
            type="button"
            class="btn btn-secondary btn-xs"
            x-on:click="selectedIds = []"
          >
            <span>Deselect All</span>
          </button>
          <button
            type="button"
            class="btn btn-danger btn-xs"
            hx-post="/api/share/bulk-delete"
            hx-target="#shared-links-tab-content"
            hx-include="[name='ids']:checked"
            hx-confirm="Permanently delete the selected share links?"
          >
            <IconTrash width={11} height={11} />
            <span>Delete Selected (<span x-text="selectedIds.length"></span>)</span>
          </button>
        </div>
      </div>

      <table class="settings-table shared-links-table">
        <thead>
          <tr>
            <th class="col-shared-select">
              <input
                type="checkbox"
                class="table-checkbox"
                x-bind:checked="selectedIds.length > 0 && selectedIds.length === allIds.length"
                x-on:change="toggleAll()"
                title="Select all links"
                aria-label="Select all links"
              />
            </th>
            <th class="col-shared-spec">Specification</th>
            <th class="col-shared-url">Share URL</th>
            <th class="col-shared-status">Status / Expiration</th>
            <th class="col-shared-creator">Created By</th>
            <th class="col-shared-actions text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => {
            const expDateObj = link.expiresAt ? new Date(link.expiresAt) : null
            const expDateFormatted = expDateObj
              ? expDateObj.toLocaleDateString(undefined, {
                  month: 'numeric',
                  day: 'numeric',
                  year: 'numeric'
                }) +
                ', ' +
                expDateObj.toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit'
                })
              : 'Never'
            const createdDate = new Date(link.createdAt).toLocaleDateString()
            const specCount = link.specIds.length

            return (
              <tr
                key={link.id}
                x-bind:class={`selectedIds.includes('${link.id}') ? 'row-selected' : ''`}
              >
                <td class="col-shared-select">
                  <input
                    type="checkbox"
                    name="ids"
                    value={link.id}
                    class="table-checkbox"
                    x-model="selectedIds"
                    aria-label={`Select share link for ${link.specTitle}`}
                  />
                </td>
                <td class="col-shared-spec">
                  <div class="shared-spec-cell">
                    <div class="shared-spec-title-row">
                      <strong class="shared-spec-title" title={link.specTitle}>
                        {link.specTitle}
                      </strong>
                      {specCount > 1 && (
                        <span class="badge badge-subtle font-xs flex-shrink-0">
                          {specCount} Specs
                        </span>
                      )}
                    </div>
                    <div
                      class="shared-spec-ids font-mono font-xs text-muted"
                      title={specCount > 1 ? link.specIds.join(', ') : (link.specIds[0] || link.specId)}
                    >
                      {specCount > 1 ? link.specIds.join(', ') : (link.specIds[0] || link.specId)}
                    </div>
                  </div>
                </td>
                <td class="col-shared-url">
                  <div class="shared-url-cell">
                    {link.alias ? (
                      <span class="role-badge-mono font-xs" title={`Custom Alias: /shared/${link.alias}`}>
                        /{link.alias}
                      </span>
                    ) : (
                      <span class="role-badge-mono font-xs" title={`Token: ${link.token}`}>
                        {link.token.slice(0, 12)}…
                      </span>
                    )}
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs"
                      x-data={`{ copied: false, copy() { navigator.clipboard.writeText(window.location.origin + '/shared/${link.alias || link.token}'); this.copied = true; setTimeout(() => this.copied = false, 1500); } }`}
                      x-on:click="copy()"
                      title="Copy Public URL"
                    >
                      <span x-show="!copied" class="flex-center-gap">
                        <IconCopy width={11} height={11} />
                        <span>Copy</span>
                      </span>
                      <span x-show="copied" x-cloak class="flex-center-gap text-success">
                        <IconCheck width={11} height={11} />
                        <span>Copied!</span>
                      </span>
                    </button>
                  </div>
                </td>
                <td class="col-shared-status">
                  <div class="shared-status-cell">
                    <span class={link.isExpired ? 'badge badge-danger font-xs' : 'badge badge-success font-xs'}>
                      {link.isExpired ? 'Expired' : 'Active'}
                    </span>
                    <span class="font-xs text-muted shared-date-text">
                      {!link.expiresAt ? 'Never expires' : link.isExpired ? expDateFormatted : `Expires ${expDateFormatted}`}
                    </span>
                  </div>
                </td>
                <td class="col-shared-creator font-xs text-muted">
                  <div class="shared-creator-cell">
                    <span>{link.creatorUsername}</span>
                    <span>&bull;</span>
                    <span>{createdDate}</span>
                  </div>
                </td>
                <td class="col-shared-actions text-right">
                  <div class="token-row-actions">
                    {!link.isExpired && (
                      <button
                        type="button"
                        class="btn btn-secondary btn-xs btn-token-danger"
                        title="Revoke public access immediately"
                        hx-post={`/api/share/revoke/${link.id}`}
                        hx-target="#shared-links-tab-content"
                        hx-confirm="Revoke this public link immediately? External viewers will lose access."
                      >
                        <span>Revoke</span>
                      </button>
                    )}
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs btn-icon-only btn-danger-icon"
                      title="Permanently delete record"
                      hx-delete={`/api/share/${link.id}`}
                      hx-target="#shared-links-tab-content"
                      hx-confirm="Permanently delete this share record?"
                    >
                      <IconTrash width={12} height={12} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// 1. Create Public Share Link (Admin / Editor Only)
shareApp.post('/api/share/create', async (c) => {
  const currentUser = c.get('user')
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'editor')) {
    return c.html(
      <AlertBox title="Access Denied" message="Only Admins and Editors can create public share links." />,
      403
    )
  }

  try {
    const body = await c.req.parseBody({ all: true })
    const rawSpecIds = body['specIds'] || body['specId']
    let specIds: string[] = []

    if (Array.isArray(rawSpecIds)) {
      specIds = rawSpecIds.map(String).map((s) => s.trim()).filter(Boolean)
    } else if (typeof rawSpecIds === 'string' && rawSpecIds.trim()) {
      specIds = parseSpecIds(rawSpecIds)
    }

    if (specIds.length === 0) {
      return c.html(
        <AlertBox title="Generation Failed" message="At least one specification must be selected." />,
        400
      )
    }

    // Resolve human-readable titles for all selected specifications
    const specTitles: string[] = []
    for (const id of specIds) {
      const localSpec = await localStorageProvider.getSpec(id)
      const memSpec = await memoryStorageProvider.getSpec(id, currentUser.id)
      const spec = localSpec || memSpec
      if (spec) {
        specTitles.push(spec.title || spec.info?.title || id)
      } else {
        specTitles.push(id)
      }
    }

    const expiresInHoursStr = ((body['expiresInHours'] as string) || '').trim()
    const customExpiresAt = ((body['customExpiresAt'] as string) || '').trim()
    const neverExpiresVal = body['neverExpires']
    const neverExpires =
      neverExpiresVal === 'true' ||
      neverExpiresVal === '1' ||
      neverExpiresVal === 'on' ||
      expiresInHoursStr === 'never'

    const allowSandboxUploadVal = body['allowSandboxUpload']
    const allowSandboxUpload =
      allowSandboxUploadVal === 'true' ||
      allowSandboxUploadVal === '1' ||
      allowSandboxUploadVal === 'on'

    const customAlias = ((body['customAlias'] as string) || '').trim() || undefined
    const expiresInHours = expiresInHoursStr ? Number(expiresInHoursStr) : 24

    const link = shareService.createShareLink({
      specIds,
      specTitles,
      userId: currentUser.id,
      expiresInHours: neverExpires ? 'never' : expiresInHours,
      neverExpires,
      customExpiresAt: customExpiresAt || undefined,
      allowSandboxUpload,
      customAlias
    })

    const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000'
    const proto = c.req.header('x-forwarded-proto') || 'http'
    const shareUrl = `${proto}://${host}/shared/${link.alias || link.token}`

    const allLinks = shareService.listSharedLinks()

    return c.html(
      <>
        <ShareResultCard
          shareUrl={shareUrl}
          specTitle={link.specTitle}
          expiresAt={link.expiresAt}
          alias={link.alias}
        />
        <div id="shared-links-tab-content" hx-swap-oob="innerHTML">
          <SharedLinksTableContent links={allLinks} />
        </div>
      </>
    )
  } catch (err: unknown) {
    logServerError('POST /api/share/create', err)
    const message = err instanceof Error ? err.message : String(err)
    return c.html(<AlertBox title="Generation Failed" message={message} />, 400)
  }
})

// 2. Revoke Share Link (Admin / Editor Only)
shareApp.post('/api/share/revoke/:id', async (c) => {
  const currentUser = c.get('user')
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'editor')) {
    return c.html(
      <AlertBox title="Access Denied" message="Only Admins and Editors can revoke share links." />,
      403
    )
  }

  const id = c.req.param('id')
  if (id) {
    shareService.revokeSharedLink(id)
  }

  const allLinks = shareService.listSharedLinks()
  return c.html(<SharedLinksTableContent links={allLinks} />)
})

// 3. Delete Share Link (Admin / Editor Only)
shareApp.delete('/api/share/:id', async (c) => {
  const currentUser = c.get('user')
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'editor')) {
    return c.html(
      <AlertBox title="Access Denied" message="Only Admins and Editors can delete share links." />,
      403
    )
  }

  const id = c.req.param('id')
  if (id) {
    shareService.deleteSharedLink(id)
  }

  const allLinks = shareService.listSharedLinks()
  return c.html(<SharedLinksTableContent links={allLinks} />)
})

// 3b. Bulk Delete Share Links (Admin / Editor Only)
shareApp.post('/api/share/bulk-delete', async (c) => {
  const currentUser = c.get('user')
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'editor')) {
    return c.html(
      <AlertBox title="Access Denied" message="Only Admins and Editors can delete share links." />,
      403
    )
  }

  try {
    let ids: string[] = []

    try {
      const formData = await c.req.formData()
      const allVals = formData.getAll('ids')
      if (allVals.length > 0) {
        ids = allVals.map(String).map((s) => s.trim()).filter(Boolean)
      }
    } catch {
      // Fallback to parseBody
    }

    if (ids.length === 0) {
      const body = await c.req.parseBody({ all: true })
      const rawIds = body['ids'] || body['ids[]']
      if (Array.isArray(rawIds)) {
        ids = rawIds.map(String).map((s) => s.trim()).filter(Boolean)
      } else if (typeof rawIds === 'string' && rawIds.trim()) {
        ids = rawIds.split(',').map((s) => s.trim()).filter(Boolean)
      }
    }

    if (ids.length > 0) {
      shareService.deleteSharedLinks(ids)
    }

    const allLinks = shareService.listSharedLinks()
    return c.html(<SharedLinksTableContent links={allLinks} />)
  } catch (err: unknown) {
    logServerError('POST /api/share/bulk-delete', err)
    const allLinks = shareService.listSharedLinks()
    return c.html(<SharedLinksTableContent links={allLinks} />)
  }
})

// 4. External Viewer Access (Public Route — No Login Required)
shareApp.get('/shared/:token', async (c) => {
  const token = c.req.param('token')
  const link = shareService.validateTokenOrAlias(token)

  if (!link) {
    deleteCookie(c, 'portal_share_token')
    return c.html(
      <Layout title="Share Link Expired - Open API Portal" isSharedView={true}>
        <div class="portal-container">
          <div class="portal-container-inner">
            <EmptyState
              title="Public Share Link Expired or Invalid"
              subtitle="This shared link is no longer active or has reached its designated expiration time. Please request a new share link from the API administrator."
              showUpload={false}
            />
          </div>
        </div>
      </Layout>,
      404
    )
  }

  // Parse all authorized specification IDs from the link
  const allowedSpecIds = parseSpecIds(link.specId)
  if (allowedSpecIds.length === 0) {
    return c.html(
      <Layout title="Specification Not Found - Open API Portal" isSharedView={true}>
        <div class="portal-container">
          <div class="portal-container-inner">
            <EmptyState
              title="Specification Not Found"
              subtitle="No specifications are associated with this share link."
              showUpload={false}
            />
          </div>
        </div>
      </Layout>,
      404
    )
  }

  // Load all authorized specifications
  const loadedSpecs: OpenApiDocument[] = []
  for (const id of allowedSpecIds) {
    const localSpec = await localStorageProvider.getSpec(id)
    const memSpec = await memoryStorageProvider.getSpec(id, link.createdById)
    const s = localSpec || memSpec
    if (s) {
      loadedSpecs.push(s)
    }
  }

  // If sandbox upload is allowed for this link, also load any private specs uploaded during this viewer session
  if (link.allowSandboxUpload === 1) {
    const viewerSandboxSpecs = await memoryStorageProvider.listSpecs(`ext_${link.id}`)
    for (const sb of viewerSandboxSpecs) {
      const s = await memoryStorageProvider.getSpec(sb.id, `ext_${link.id}`)
      if (s && !loadedSpecs.some((ls) => ls.id === s.id)) {
        loadedSpecs.push(s)
      }
    }
  }

  if (loadedSpecs.length === 0) {
    return c.html(
      <Layout title="Specification Not Found - Open API Portal" isSharedView={true}>
        <div class="portal-container">
          <div class="portal-container-inner">
            <EmptyState
              title="Specification Not Found"
              subtitle="The OpenAPI specifications associated with this share link could not be found."
              showUpload={false}
            />
          </div>
        </div>
      </Layout>,
      404
    )
  }

  // Determine active specification: query param ?specId= if valid, else first loaded spec
  const requestedSpecId = (c.req.query('specId') || '').trim()
  const activeSpec = (requestedSpecId
    ? loadedSpecs.find((s) => s.id.toLowerCase() === requestedSpecId.toLowerCase())
    : undefined) || loadedSpecs[0]

  const requestedEndpointId = c.req.query('endpoint') || c.req.query('operationId')
  const activeEndpoint = (requestedEndpointId
    ? activeSpec.endpoints.find(
        (e) =>
          e.id.toLowerCase() === requestedEndpointId.toLowerCase() ||
          e.path.toLowerCase() === requestedEndpointId.toLowerCase()
      )
    : undefined) || activeSpec.endpoints[0]

  const activeSpecTitle = activeSpec.title || activeSpec.info.title
  const activeSpecVersion = activeSpec.version || activeSpec.info.version

  const allSpecSummaries: SpecSummary[] = loadedSpecs.map((s) => ({
    id: s.id,
    title: s.title || s.info.title,
    version: s.version || s.info.version,
    endpointCount: s.endpoints.length,
    createdAt: link.createdAt
  }))

  // Set share token cookie for external viewer session
  const remainingSecs = link.expiresAt
    ? Math.max(0, Math.floor((new Date(link.expiresAt).getTime() - Date.now()) / 1000))
    : 31536000 // 1 year for non-expiring links
  setCookie(c, 'portal_share_token', link.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: remainingSecs
  })

  return c.html(
    <Layout
      title={`${activeSpecTitle} (Shared API Docs) - Open API Portal`}
      activeSpecId={activeSpec.id}
      activeSpecTitle={activeSpecTitle}
      activeSpecVersion={activeSpecVersion}
      spec={activeSpec}
      allSpecs={allSpecSummaries}
      isSharedView={true}
      shareExpiresAt={link.expiresAt}
      shareToken={link.alias || link.token}
      allowSandboxUpload={link.allowSandboxUpload === 1}
    >
      <div class="portal-workspace">
        <SpecSidebar
          specs={allSpecSummaries}
          activeSpecId={activeSpec.id}
          endpoints={activeSpec.endpoints}
          tags={activeSpec.tags}
          activeEndpointId={activeEndpoint?.id}
          spec={activeSpec}
          shareToken={link.alias || link.token}
        />
        <div id="spec-detail-container" class="main-content">
          {activeEndpoint ? (
            <SpecDetail spec={activeSpec} endpoint={activeEndpoint} />
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

// 5. HTMX Endpoint Switcher Partial for External Shared View
shareApp.get('/api/shared/endpoint', async (c) => {
  const token = (c.req.query('token') || '').trim()
  const operationId = (c.req.query('operationId') || '').trim()
  const requestedSpecId = (c.req.query('specId') || '').trim()

  const link = shareService.validateTokenOrAlias(token)
  if (!link) {
    return c.html(
      <AlertBox title="Access Denied" message="Share session is expired or invalid." />,
      403
    )
  }

  const allowedSpecIds = parseSpecIds(link.specId)
  let targetSpecId = allowedSpecIds[0]

  if (
    requestedSpecId &&
    allowedSpecIds.some((id) => id.toLowerCase() === requestedSpecId.toLowerCase())
  ) {
    targetSpecId =
      allowedSpecIds.find((id) => id.toLowerCase() === requestedSpecId.toLowerCase()) ||
      targetSpecId
  } else if (requestedSpecId && link.allowSandboxUpload === 1) {
    targetSpecId = requestedSpecId
  }

  // Load target specification
  const localSpec = await localStorageProvider.getSpec(targetSpecId)
  const memSpec = await memoryStorageProvider.getSpec(targetSpecId, link.createdById)
  let spec = localSpec || memSpec

  // If not found and sandbox upload is allowed, check viewer's private sandbox storage
  if (!spec && link.allowSandboxUpload === 1) {
    spec = await memoryStorageProvider.getSpec(targetSpecId, `ext_${link.id}`)
  }

  // Fallback: if operation not in target spec, scan other allowed specs in link
  if (
    !spec ||
    !spec.endpoints.some(
      (e) =>
        e.id.toLowerCase() === operationId.toLowerCase() ||
        e.path.toLowerCase() === operationId.toLowerCase()
    )
  ) {
    for (const otherId of allowedSpecIds) {
      if (otherId === targetSpecId) continue
      const l = await localStorageProvider.getSpec(otherId)
      const m = await memoryStorageProvider.getSpec(otherId, link.createdById)
      const candidate = l || m
      if (
        candidate &&
        candidate.endpoints.some(
          (e) =>
            e.id.toLowerCase() === operationId.toLowerCase() ||
            e.path.toLowerCase() === operationId.toLowerCase()
        )
      ) {
        spec = candidate
        break
      }
    }
  }

  if (!spec) {
    return c.html(
      <AlertBox title="Spec Error" message="Specification not found." />,
      404
    )
  }

  const endpoint = spec.endpoints.find(
    (e) =>
      e.id.toLowerCase() === operationId.toLowerCase() ||
      e.path.toLowerCase() === operationId.toLowerCase()
  )

  if (!endpoint) {
    return c.html(
      <AlertBox title="Endpoint Error" message="Endpoint not found." />,
      404
    )
  }

  return c.html(<SpecDetail spec={spec} endpoint={endpoint} />)
})
