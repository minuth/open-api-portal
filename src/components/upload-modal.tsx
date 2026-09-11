import { jsx } from 'hono/jsx'
import { GitTokenRecord, UserRecord } from '../db/schema'
import { IconUpload, IconFile, IconGit, IconLock, IconClose } from './icons'

export interface UploadModalProps {
  tokens?: GitTokenRecord[]
  user?: UserRecord | null
}

export const UploadModal = ({ tokens = [], user }: UploadModalProps) => {
  const isViewer = user?.role === 'viewer'

  return (
    <div
      class="modal-backdrop"
      x-show="openUploadModal"
      x-cloak
      x-data="{ activeTab: 'local', provider: 'auto', tokenMode: '' }"
    >
      <div
        class="modal-card"
        {...{
          'x-show': 'openUploadModal',
          'x-transition:enter': 'transition ease-out duration-150',
          'x-transition:enter-start': 'opacity-0 transform scale-95',
          'x-transition:enter-end': 'opacity-100 transform scale-100'
        }}
      >
        <div class="modal-header">
          <h2 class="modal-title">
            <IconUpload width={16} height={16} />
            {isViewer ? 'Upload Sandbox Spec (Private to You)' : 'OpenAPI Specification Source'}
          </h2>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="openUploadModal = false"
          >
            <IconClose width={14} height={14} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div class="modal-tab-bar">
          <button
            type="button"
            class="modal-tab-btn"
            x-bind:class="activeTab === 'local' ? 'active' : ''"
            x-on:click="activeTab = 'local'"
          >
            <IconFile />
            Local File Upload
          </button>

          {!isViewer && (
            <button
              type="button"
              class="modal-tab-btn"
              x-bind:class="activeTab === 'scm' ? 'active' : ''"
              x-on:click="activeTab = 'scm'"
            >
              <IconGit />
              GitHub / GitLab SCM
            </button>
          )}
        </div>

        {/* Tab 1: Local File Upload Form */}
        <div x-show="activeTab === 'local'">
          <form
            hx-post="/api/upload"
            hx-target="#app-main"
            hx-swap="innerHTML"
            hx-encoding="multipart/form-data"
            hx-indicator="#local-submit-btn"
            hx-disabled-elt="#local-submit-btn"
            {...{ 'hx-on::after-request': 'openUploadModal = false' }}
          >
            <div class="form-group">
              <label class="form-label">
                Select OpenAPI Spec File (.yaml, .yml)
              </label>
              <input
                type="file"
                name="specFile"
                accept=".yaml,.yml"
                required
                class="input file-input"
              />
            </div>

            <div class="upload-options-card">
              <div class="upload-options-title">
                Storage Mode
              </div>

              {!isViewer ? (
                <>
                  <label class="radio-option-item">
                    <input
                      type="radio"
                      name="mode"
                      value="save"
                      checked
                      class="radio-input"
                    />
                    <div>
                      <div class="radio-option-heading">1. Save to Project</div>
                      <div class="radio-option-sub">
                        Saves the YAML file permanently into <code>./storage/specs/</code> (shared with all portal users).
                      </div>
                    </div>
                  </label>

                  <label class="radio-option-item">
                    <input
                      type="radio"
                      name="mode"
                      value="view"
                      class="radio-input"
                    />
                    <div>
                      <div class="radio-option-heading">2. View Only (Sandbox)</div>
                      <div class="radio-option-sub">
                        Tests the API specification in private session memory.
                      </div>
                    </div>
                  </label>
                </>
              ) : (
                <label class="radio-option-item active">
                  <input
                    type="radio"
                    name="mode"
                    value="view"
                    checked
                    class="radio-input"
                  />
                  <div>
                    <div class="radio-option-heading flex-center-gap">
                      <IconLock width={14} height={14} /> Private User Sandbox
                    </div>
                    <div class="radio-option-sub">
                      As a <strong>Viewer</strong>, your uploaded specification will be stored in your private Sandbox session and will only appear to you (not shared with other users).
                    </div>
                  </div>
                </label>
              )}
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                x-on:click="openUploadModal = false"
              >
                <span>Cancel</span>
              </button>
              <button type="submit" id="local-submit-btn" class="btn btn-primary">
                <span class="htmx-indicator btn-spinner" aria-hidden="true"></span>
                <span class="btn-label-idle">Process Spec</span>
                <span class="htmx-indicator btn-label-loading">Processing…</span>
              </button>
            </div>
          </form>
        </div>

        {/* Tab 2: GitHub & GitLab SCM Import Form (Admin & Editor Only) */}
        {!isViewer && (
          <div x-show="activeTab === 'scm'" x-cloak>
            <form
              hx-post="/api/scm/import"
              hx-target="this"
              hx-swap="none"
              hx-indicator="#scm-submit-btn"
              hx-disabled-elt="#scm-submit-btn"
              {...{
                'hx-on::after-request': 'if (event.detail.successful) openUploadModal = false',
                'hx-on:htmx:response-error': `(function(xhr){
                  var tmp = document.createElement('div');
                  tmp.innerHTML = xhr.response;
                  var titleEl = tmp.querySelector('.alert-title');
                  var title = titleEl ? titleEl.textContent.trim() : 'SCM Import Error';
                  if (titleEl) titleEl.remove();
                  var bodyEl = tmp.querySelector('.alert-error');
                  var message = bodyEl ? bodyEl.textContent.trim() : xhr.response;
                  window.dispatchEvent(new CustomEvent('show-error-dialog', { detail: { title: title, message: message } }));
                })(event.detail.xhr)`
              }}
            >
              <div class="form-group">
                <div class="form-field">
                  <label class="form-label">SCM Provider</label>
                  <select class="select" name="provider" x-model="provider">
                    <option value="auto">Auto-detect (GitHub or GitLab)</option>
                    <option value="github">GitHub (github.com)</option>
                    <option value="gitlab">GitLab (gitlab.com)</option>
                  </select>
                </div>

                <div class="form-field">
                  <label class="form-label">Repository URL or Owner/Repo *</label>
                  <input
                    type="text"
                    name="repoUrl"
                    placeholder="https://github.com/swagger-api/swagger-petstore"
                    required
                    class="input"
                  />
                </div>

                <div class="form-row-2">
                  <div class="form-field">
                    <label class="form-label">File Path in Repo *</label>
                    <input
                      type="text"
                      name="filePath"
                      placeholder="src/main/resources/openapi.yaml"
                      required
                      class="input"
                    />
                  </div>

                  <div class="form-field">
                    <label class="form-label">Branch / Tag</label>
                    <input
                      type="text"
                      name="branch"
                      placeholder="main"
                      value="main"
                      class="input"
                    />
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label">Personal Access Token (PAT) — AES-256 Encrypted</label>
                  <select
                    class="select"
                    name="tokenId"
                    x-model="tokenMode"
                    x-on:change="if ($event.target.value === 'new') { openTokenModal = true; tokenMode = ''; }"
                  >
                    <option value="">None (Public Repository)</option>
                    {tokens.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.provider === 'github' ? 'GitHub' : 'GitLab'})
                      </option>
                    ))}
                    <option value="new">+ Add New Reusable Token...</option>
                  </select>
                </div>

                <div class="form-field">
                  <label class="form-label">Display Title (Optional)</label>
                  <input
                    type="text"
                    name="name"
                    placeholder="My Remote OpenAPI Spec"
                    class="input"
                  />
                </div>
              </div>

              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  x-on:click="openUploadModal = false"
                >
                  <span>Cancel</span>
                </button>
                <button type="submit" id="scm-submit-btn" class="btn btn-primary">
                  <span class="htmx-indicator btn-spinner" aria-hidden="true"></span>
                  <span class="btn-label-idle">Import &amp; Sync from SCM</span>
                  <span class="htmx-indicator btn-label-loading">Importing…</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

