import { jsx } from 'hono/jsx'
import { MethodBadge } from './method-badge'
import { EndpointOperation, SpecSummary, TagObject } from '../types/openapi'
import { IconSearch } from './icons'

export interface SpecSidebarProps {
  specs: SpecSummary[]
  activeSpecId?: string
  endpoints: EndpointOperation[]
  tags?: TagObject[]
  activeEndpointId?: string
}

export const SpecSidebar = ({
  specs,
  activeSpecId,
  endpoints,
  tags = [],
  activeEndpointId
}: SpecSidebarProps) => {
  // Group endpoints by tag
  const tagGroups = new Map<string, EndpointOperation[]>()

  for (const tag of tags) {
    tagGroups.set(tag.name, [])
  }

  const UNTAGGED = 'Default'

  for (const ep of endpoints) {
    if (ep.tags && ep.tags.length > 0) {
      for (const tag of ep.tags) {
        if (!tagGroups.has(tag)) {
          tagGroups.set(tag, [])
        }
        tagGroups.get(tag)?.push(ep)
      }
    } else {
      if (!tagGroups.has(UNTAGGED)) {
        tagGroups.set(UNTAGGED, [])
      }
      tagGroups.get(UNTAGGED)?.push(ep)
    }
  }

  for (const [key, list] of tagGroups.entries()) {
    if (list.length === 0) {
      tagGroups.delete(key)
    }
  }

  // Initial active ID for Alpine (server-rendered)
  const initialActiveId = activeEndpointId || ''

  return (
    <aside
      class="sidebar"
      x-data={`{
        search: '',
        activeId: '${initialActiveId}',
        init() {
          const syncFromHash = () => {
            const raw = window.location.hash ? window.location.hash.slice(1) : ''
            if (!raw) return
            const target = decodeURIComponent(raw).toLowerCase()
            const btn = document.querySelector('[data-endpoint-id=\"' + target + '\"]') ||
                        Array.from(document.querySelectorAll('.sidebar-endpoint-item')).find(b => {
                          const eid = (b.getAttribute('data-endpoint-id') || '').toLowerCase()
                          const epath = (b.getAttribute('data-endpoint-path') || '').toLowerCase()
                          return eid === target || epath === target
                        })
            if (btn && btn.getAttribute('data-endpoint-id') !== this.activeId) {
              btn.click()
            }
          }
          syncFromHash()
          window.addEventListener('hashchange', syncFromHash)
        }
      }`}
    >
      {/* Spec Selector */}
      <div class="sidebar-catalog">
        <div class="sidebar-label-row">
          <label class="sidebar-label">Specification</label>
          <a href="/specs" class="sidebar-manage-link" title="Manage specifications">Manage</a>
        </div>
        {specs.length > 0 ? (
          <select
            class="select"
            x-on:change="window.location.href = '/specs/' + encodeURIComponent($event.target.value)"
            name="specId"
          >
            {specs.map((spec) => (
              <option key={spec.id} value={spec.id} selected={spec.id === activeSpecId}>
                {spec.title} ({spec.version}){spec.isTemporary ? ' [Sandbox]' : ''}
              </option>
            ))}
          </select>
        ) : (
          <div class="sidebar-empty-label">No specifications loaded</div>
        )}
      </div>

      {/* Search */}
      <div class="sidebar-search-box">
        <div class="search-input-wrapper">
          <IconSearch />
          <input
            type="text"
            placeholder="Filter endpoints..."
            class="sidebar-search-input"
            x-model="search"
          />
        </div>
      </div>

      {/* Endpoints List */}
      <div class="sidebar-endpoints-list">
        {Array.from(tagGroups.entries()).map(([tagName, groupEndpoints]) => (
          <div key={tagName} class="sidebar-group">
            <div class="tag-group-title">{tagName}</div>
            {groupEndpoints.map((ep) => {
              const searchHaystack = `${ep.method} ${ep.path} ${ep.summary || ''} ${tagName}`.toLowerCase()
              return (
                <button
                  type="button"
                  key={ep.id}
                  id={`sidebar-btn-${ep.id}`}
                  data-endpoint-id={ep.id}
                  data-endpoint-path={ep.path}
                  class="sidebar-endpoint-item"
                  x-bind:class={`activeId === '${ep.id}' ? 'active' : ''`}
                  x-on:click={`activeId = '${ep.id}'; if (window.history && window.history.replaceState) { window.history.replaceState(null, '', '#' + encodeURIComponent('${ep.id}')); } else { window.location.hash = '${ep.id}'; }`}
                  hx-get={`/api/specs/endpoint?specId=${encodeURIComponent(activeSpecId || '')}&operationId=${encodeURIComponent(ep.id)}`}
                  hx-target="#spec-detail-container"
                  hx-swap="innerHTML"
                  x-show={`search === '' || '${searchHaystack}'.includes(search.toLowerCase())`}
                >
                  <MethodBadge method={ep.method} />
                  <span class="endpoint-path">{ep.path}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}
