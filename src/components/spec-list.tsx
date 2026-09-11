import { jsx } from 'hono/jsx'
import { SpecSummary } from '../types/openapi'
import { GitSourceRecord } from '../db/schema'
import { EmptyState } from './empty-state'
import { IconEndpoints, IconCalendar, IconEye, IconRefresh, IconTrash, IconShare } from './icons'

export interface SpecListProps {
  specs: SpecSummary[]
  gitSources?: Record<string, GitSourceRecord>
}

export const SpecList = ({ specs, gitSources = {} }: SpecListProps) => {
  if (!specs || specs.length === 0) {
    return (
      <EmptyState
        title="No Specifications Available"
        subtitle="Upload an OpenAPI YAML file or import from GitHub/GitLab to start exploring endpoints."
        showUpload={true}
      />
    )
  }

  return (
    <div id="specs-list-container" class="specs-manager-container">
      <div class="specs-manager-header">
        <div>
          <h2 class="specs-manager-title">All Specifications</h2>
          <p class="specs-manager-subtitle">
            Manage, view, sync, and delete uploaded or SCM-linked OpenAPI documents.
          </p>
        </div>
      </div>

      <div class="specs-grid">
        {specs.map((spec) => {
          const gitRecord = gitSources[spec.id]
          return (
            <div key={spec.id} class="spec-card">
              <div class="spec-card-header">
                <div class="spec-card-title-group">
                  <h3 class="spec-card-title">{spec.title}</h3>
                  <span class="spec-version-badge">v{spec.version}</span>
                </div>
                {gitRecord ? (
                  <span class={`badge badge-${gitRecord.provider}`} title={`Linked to ${gitRecord.provider}: ${gitRecord.repoUrl} @ ${gitRecord.branch}`}>
                    {gitRecord.provider === 'github' ? 'GitHub' : 'GitLab'}
                  </span>
                ) : spec.isTemporary ? (
                  <span class="badge badge-sandbox" title="Stored in temporary sandbox memory">Sandbox</span>
                ) : (
                  <span class="badge badge-local" title="Saved locally in ./storage/specs/">Local</span>
                )}
              </div>

              {spec.description ? (
                <p class="spec-card-description">{spec.description}</p>
              ) : (
                <p class="spec-card-description spec-description-empty">No description provided.</p>
              )}

              <div class="spec-card-meta">
                <div class="meta-item">
                  <IconEndpoints />
                  <span>{spec.endpointCount} {spec.endpointCount === 1 ? 'endpoint' : 'endpoints'}</span>
                </div>
                <div class="meta-item">
                  <IconCalendar />
                  <span>{new Date(spec.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div class="spec-card-actions">
                <div class="btn-group-left">
                  <a
                    href={`/specs/${encodeURIComponent(spec.id)}`}
                    class="btn btn-secondary btn-sm"
                  >
                    <IconEye />
                    <span>View Docs</span>
                  </a>

                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    x-on:click={`$dispatch('open-share-modal', { specId: '${spec.id}', specTitle: '${spec.title.replace(/'/g, "\\'")}' })`}
                    title="Create public share link"
                  >
                    <IconShare width={13} height={13} />
                    <span>Share</span>
                  </button>

                  {gitRecord && (
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      hx-post={`/api/scm/sync/${encodeURIComponent(spec.id)}`}
                      hx-target="#app-main"
                      hx-swap="innerHTML"
                      title="Fetch latest version from GitHub/GitLab"
                    >
                      <IconRefresh />
                      <span>Sync Git</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  class="btn btn-danger-ghost btn-sm"
                  hx-delete={`/api/specs/${encodeURIComponent(spec.id)}`}
                  hx-confirm={`Are you sure you want to delete "${spec.title}"?`}
                  hx-target="#specs-list-container"
                  hx-swap="outerHTML"
                >
                  <IconTrash />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
