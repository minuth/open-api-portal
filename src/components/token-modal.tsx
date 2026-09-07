import { jsx } from 'hono/jsx'
import { GitTokenRecord } from '../db/schema'
import { IconGit, IconTrash, IconPencil, IconLock, IconClose } from './icons'

export interface TokenModalProps {
  tokens?: GitTokenRecord[]
}

export const TokenModal = ({ tokens = [] }: TokenModalProps) => {
  return (
    <div
      class="modal-backdrop"
      x-show="openTokenModal"
      x-cloak
      x-data={`{
        mode: 'add',
        tokenId: '',
        name: '',
        provider: 'github',
        rawToken: '',
        resetForm() {
          this.mode = 'add';
          this.tokenId = '';
          this.name = '';
          this.provider = 'github';
          this.rawToken = '';
        },
        editToken(id, name, provider) {
          this.mode = 'edit';
          this.tokenId = id;
          this.name = name;
          this.provider = provider;
          this.rawToken = '';
        }
      }`}
    >
      <div
        class="modal-card modal-card-wide"
        {...{
          'x-show': 'openTokenModal',
          'x-transition:enter': 'transition ease-out duration-150',
          'x-transition:enter-start': 'opacity-0 transform scale-95',
          'x-transition:enter-end': 'opacity-100 transform scale-100'
        }}
      >
        <div class="modal-header">
          <h2 class="modal-title">
            <IconGit width={16} height={16} />
            Personal Access Token (PAT) Manager
          </h2>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="openTokenModal = false; resetForm();"
            aria-label="Close dialog"
          >
            <IconClose width={14} height={14} />
          </button>
        </div>

        {/* List of Saved Tokens (if any) */}
        {tokens.length > 0 && (
          <div class="tokens-list-card">
            <div class="tokens-list-title">Saved PAT Tokens ({tokens.length})</div>
            <div class="tokens-list-items">
              {tokens.map((t) => (
                <div key={t.id} class="token-list-item">
                  <div class="token-info">
                    <IconLock width={14} height={14} class="token-lock-icon" />
                    <span class="token-name">{t.name}</span>
                    <span class={`token-provider-tag tag-${t.provider}`}>
                      {t.provider === 'github' ? 'GitHub' : 'GitLab'}
                    </span>
                  </div>
                  <div class="token-actions">
                    <button
                      type="button"
                      class="btn-token-action"
                      x-on:click={`editToken('${t.id}', '${t.name.replace(/'/g, "\\'")}', '${t.provider}')`}
                      title="Edit token secret or label"
                    >
                      <IconPencil width={13} height={13} />
                      Edit
                    </button>
                    <button
                      type="button"
                      class="btn-token-action btn-token-danger"
                      hx-delete={`/api/scm/tokens/${t.id}`}
                      hx-confirm={`Are you sure you want to delete token "${t.name}"?`}
                      hx-target="#app-main"
                      hx-swap="innerHTML"
                      title="Delete token"
                    >
                      <IconTrash width={13} height={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Token Add / Update Form */}
        <form
          hx-post="/api/scm/tokens"
          hx-target="#app-main"
          hx-swap="innerHTML"
          {...{ 'hx-on::after-request': 'openTokenModal = false; resetForm();' }}
        >
          <input type="hidden" name="tokenId" x-model="tokenId" />

          <div class="form-section-header">
            <h3 class="form-section-title">
              <span x-show="mode === 'add'">Add New PAT Token</span>
              <span x-show="mode === 'edit'">Update Token</span>
            </h3>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              x-show="mode === 'edit'"
              x-on:click="resetForm()"
            >
              + Add New Token Instead
            </button>
          </div>

          <div class="form-group">
            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label">Token Label Name *</label>
                <input
                  type="text"
                  name="name"
                  x-model="name"
                  placeholder="e.g. My Work GitHub Token"
                  required
                  class="input"
                />
              </div>

              <div class="form-field">
                <label class="form-label">SCM Provider *</label>
                <select class="select" name="provider" x-model="provider">
                  <option value="github">GitHub (github.com)</option>
                  <option value="gitlab">GitLab (gitlab.com)</option>
                </select>
              </div>
            </div>

            <div class="form-field">
              <label class="form-label">
                Personal Access Token Secret
                <span x-show="mode === 'add'"> *</span>
              </label>
              <input
                type="password"
                name="rawToken"
                x-model="rawToken"
                placeholder="ghp_xxx (GitHub) or glpat-xxx (GitLab)"
                x-bind:required="mode === 'add'"
                class="input"
              />
              <div class="radio-option-sub">
                <span x-show="mode === 'add'">Stored securely using AES-256-GCM encryption.</span>
                <span x-show="mode === 'edit'">Leave blank to keep existing encrypted token secret unchanged.</span>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              x-on:click="openTokenModal = false; resetForm();"
            >
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              <span x-show="mode === 'add'">Save Encrypted Token</span>
              <span x-show="mode === 'edit'">Update PAT Token</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
