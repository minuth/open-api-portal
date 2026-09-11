import { jsx } from 'hono/jsx'
import { GitTokenRecord, UserRecord } from '../db/schema'
import { SharedLinkWithCreator } from '../services/share-service'
import { SharedLinksTableContent } from '../routes/share'
import { IconSettings, IconKey, IconGit, IconUsers, IconPencil, IconTrash, IconPlus, IconShare } from './icons'

export interface SettingsPageProps {
  user?: UserRecord | null
  tokens?: GitTokenRecord[]
  users?: UserRecord[]
  sharedLinks?: SharedLinkWithCreator[]
  initialTab?: string
}

export function SettingsPage({
  user,
  tokens = [],
  users = [],
  sharedLinks = [],
  initialTab = 'account'
}: SettingsPageProps) {
  const isAdmin = user?.role === 'admin'
  const canConfigToken = user?.role === 'admin' || user?.role === 'editor'
  const canManageShare = user?.role === 'admin' || user?.role === 'editor'

  return (
    <div
      class="settings-container"
      x-data={`{
        activeTab: '${initialTab}',
        showTokenForm: false,
        showInviteForm: false,
        tokenMode: 'add',
        tokenId: '',
        tokenName: '',
        tokenProvider: 'github',
        tokenSecret: '',
        resetTokenForm() {
          this.tokenMode = 'add';
          this.tokenId = '';
          this.tokenName = '';
          this.tokenProvider = 'github';
          this.tokenSecret = '';
          this.showTokenForm = false;
        },
        editToken(id, name, provider) {
          this.tokenMode = 'edit';
          this.tokenId = id;
          this.tokenName = name;
          this.tokenProvider = provider;
          this.tokenSecret = '';
          this.showTokenForm = true;
          this.$nextTick(() => {
            var el = document.getElementById('token-name-input');
            if (el) el.focus();
          });
        }
      }`}
    >
      {/* Page Header */}
      <div class="settings-header">
        <h1 class="settings-title">
          <IconSettings width={18} height={18} />
          <span>Settings</span>
        </h1>
      </div>

      {/* Horizontal Tab Navigation */}
      <nav class="settings-tabs" aria-label="Settings Tabs">
        <button
          type="button"
          class="settings-tab-btn"
          x-bind:class="activeTab === 'account' ? 'active' : ''"
          x-on:click="activeTab = 'account'"
        >
          Account
        </button>

        <button
          type="button"
          class="settings-tab-btn"
          x-bind:class="activeTab === 'security' ? 'active' : ''"
          x-on:click="activeTab = 'security'"
        >
          Security
        </button>

        {canManageShare && (
          <button
            type="button"
            class="settings-tab-btn"
            x-bind:class="activeTab === 'shared-links' ? 'active' : ''"
            x-on:click="activeTab = 'shared-links'"
          >
            Shared Links
          </button>
        )}

        {canConfigToken && (
          <button
            type="button"
            class="settings-tab-btn"
            x-bind:class="activeTab === 'tokens' ? 'active' : ''"
            x-on:click="activeTab = 'tokens'"
          >
            Access Tokens
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            class="settings-tab-btn"
            x-bind:class="activeTab === 'users' ? 'active' : ''"
            x-on:click="activeTab = 'users'"
          >
            Team Members
          </button>
        )}
      </nav>

      {/* Content Area */}
      <div>
        {/* ─── TAB 1: Account ─── */}
        <div x-show="activeTab === 'account'" class="settings-section">
          {/* Profile Card */}
          <div class="settings-card">
            <div class="settings-card-header">
              <div>
                <h2 class="settings-card-title">Profile</h2>
                <p class="settings-card-desc">Your active user identity and access role.</p>
              </div>
            </div>
            <div class="settings-card-body">
              <div class="settings-prop-list">
                <div class="settings-prop-row">
                  <span class="settings-prop-label">Username</span>
                  <span class="settings-prop-val font-mono">{user?.username || '—'}</span>
                </div>
                <div class="settings-prop-row">
                  <span class="settings-prop-label">Email Address</span>
                  <span class="settings-prop-val">{user?.email || '—'}</span>
                </div>
                <div class="settings-prop-row">
                  <span class="settings-prop-label">Role</span>
                  <span class="role-badge-mono">{(user?.role || 'viewer').toUpperCase()}</span>
                </div>
                <div class="settings-prop-row">
                  <span class="settings-prop-label">User ID</span>
                  <span class="settings-prop-val font-mono text-muted font-sm">{user?.id || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── TAB 2: Security ─── */}
        <div x-show="activeTab === 'security'" x-cloak class="settings-section">
          {/* Change Password Card */}
          <div class="settings-card">
            <div class="settings-card-header">
              <div>
                <h2 class="settings-card-title">Change Password</h2>
                <p class="settings-card-desc">Update your sign-in password. Minimum 6 characters.</p>
              </div>
            </div>
            <div class="settings-card-body">
              <form
                hx-post="/api/auth/change-password"
                hx-target="#password-feedback"
                hx-swap="innerHTML"
                hx-indicator="#password-submit-btn"
                hx-disabled-elt="#password-submit-btn"
                class="settings-section"
                {...{
                  'hx-on::before-request': 'var fb = document.getElementById("password-feedback"); if (fb) fb.innerHTML = "";',
                  'hx-on::before-swap': 'if (event.detail.xhr && event.detail.xhr.status >= 400) { event.detail.shouldSwap = true; event.detail.isError = false; }',
                  'hx-on::after-request': 'if (event.detail.xhr && event.detail.xhr.status === 200) { this.reset(); }'
                }}
              >
                <div id="password-feedback"></div>

                <div class="form-group">
                  <label class="form-label" for="current-pwd">Current Password</label>
                  <input
                    id="current-pwd"
                    type="password"
                    name="currentPassword"
                    required
                    autocomplete="current-password"
                    placeholder="Enter current password"
                    class="input"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="new-pwd">New Password</label>
                  <input
                    id="new-pwd"
                    type="password"
                    name="newPassword"
                    required
                    minLength={6}
                    autocomplete="new-password"
                    placeholder="Enter new password"
                    class="input"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="confirm-pwd">Confirm New Password</label>
                  <input
                    id="confirm-pwd"
                    type="password"
                    name="confirmPassword"
                    required
                    minLength={6}
                    autocomplete="new-password"
                    placeholder="Confirm new password"
                    class="input"
                  />
                </div>

                <div class="settings-form-actions">
                  <button type="submit" id="password-submit-btn" class="btn btn-primary btn-sm">
                    <span class="htmx-indicator btn-spinner" aria-hidden="true"></span>
                    <span class="btn-label-idle">Update Password</span>
                    <span class="htmx-indicator btn-label-loading">Updating…</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* ─── TAB: Shared Links (Admin & Editor) ─── */}
        {canManageShare && (
          <div x-show="activeTab === 'shared-links'" x-cloak class="settings-section">
            <div class="settings-card">
              <div class="settings-card-header">
                <div>
                  <h2 class="settings-card-title">Public Shared Links</h2>
                </div>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  x-on:click="$dispatch('open-share-modal')"
                >
                  <IconPlus width={13} height={13} />
                  <span>Create Share Link</span>
                </button>
              </div>

              {/* Shared Links Table Container (Supports HTMX swaps on revoke/delete) */}
              <div id="shared-links-tab-content">
                <SharedLinksTableContent links={sharedLinks} />
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: Access Tokens (Admin & Editor) ─── */}
        {canConfigToken && (
          <div x-show="activeTab === 'tokens'" x-cloak class="settings-section">
            <div class="settings-card">
              <div class="settings-card-header">
                <div>
                  <h2 class="settings-card-title">Personal Access Tokens</h2>
                  <p class="settings-card-desc">
                    Encrypted with AES-256-GCM. Used to synchronize private GitHub and GitLab repositories.
                  </p>
                </div>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  x-on:click="showTokenForm = !showTokenForm; if (!showTokenForm) resetTokenForm();"
                >
                  <IconPlus width={13} height={13} />
                  <span x-text="showTokenForm ? 'Close Form' : 'Add Token'">Add Token</span>
                </button>
              </div>

              {/* Add / Edit Form (Collapsible) */}
              <div x-show="showTokenForm" class="settings-card-body settings-collapsible-drawer">
                <form
                  hx-post="/api/scm/tokens"
                  hx-target="#token-feedback"
                  hx-swap="innerHTML"
                  class="settings-section"
                  autocomplete="off"
                  {...{
                    'hx-on::before-request': 'var fb = document.getElementById("token-feedback"); if (fb) fb.innerHTML = "";',
                    'hx-on::before-swap': 'if (event.detail.xhr && event.detail.xhr.status >= 400) { event.detail.shouldSwap = true; event.detail.isError = false; }',
                    'hx-on::after-request': 'if (event.detail.xhr && event.detail.xhr.status === 200) { resetTokenForm(); window.location.reload(); }'
                  }}
                >
                  <div id="token-feedback"></div>
                  <input type="hidden" name="tokenId" x-model="tokenId" />

                  <div class="form-group">
                    <label class="form-label">Provider</label>
                    <div class="radio-group-inline">
                      <label class="radio-label-inline">
                        <input type="radio" name="provider" value="github" x-model="tokenProvider" />
                        <span>GitHub</span>
                      </label>
                      <label class="radio-label-inline">
                        <input type="radio" name="provider" value="gitlab" x-model="tokenProvider" />
                        <span>GitLab</span>
                      </label>
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="token-name-input">Label Name</label>
                    <input
                      id="token-name-input"
                      type="text"
                      name="name"
                      x-model="tokenName"
                      required
                      autocomplete="off"
                      placeholder="e.g. Org Read-Only Token"
                      class="input"
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="token-secret-input">
                      Token Secret
                      <span class="text-muted font-sm" x-show="tokenMode === 'edit'">(leave empty to keep current)</span>
                    </label>
                    <input
                      id="token-secret-input"
                      type="password"
                      name="rawToken"
                      x-model="tokenSecret"
                      x-bind:required="tokenMode === 'add'"
                      autocomplete="new-password"
                      placeholder="ghp_... or glpat-..."
                      class="input font-mono"
                    />
                  </div>

                  <div class="settings-form-actions">
                    <button type="submit" class="btn btn-primary btn-sm">
                      <span x-text="tokenMode === 'add' ? 'Save Token' : 'Update Token'">Save Token</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      x-on:click="resetTokenForm()"
                    >
                      <span>Cancel</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Tokens Table or Clean Empty State */}
              <div class="settings-table-wrapper">
                {tokens.length === 0 ? (
                  <div x-show="!showTokenForm" class="settings-empty-state">
                    No personal access tokens configured yet.
                  </div>
                ) : (
                  <table class="settings-table">
                    <thead>
                      <tr>
                        <th>Label Name</th>
                        <th>Provider</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map((t) => (
                        <tr key={t.id}>
                          <td class="font-semibold text-main">{t.name}</td>
                          <td>
                            <span class="role-badge-mono">
                              {t.provider === 'github' ? 'GitHub' : 'GitLab'}
                            </span>
                          </td>
                          <td class="font-mono text-muted font-sm">AES-256</td>
                          <td class="font-mono text-muted font-sm">
                            {new Date(t.createdAt).toLocaleDateString()}
                          </td>
                          <td>
                            <div class="token-row-actions">
                              <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                title="Edit Token"
                                x-on:click={`editToken('${t.id}', '${t.name.replace(/'/g, "\\'")}', '${t.provider}')`}
                              >
                                <IconPencil width={12} height={12} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                title="Delete Token"
                                hx-delete={`/api/scm/tokens/${t.id}`}
                                hx-confirm={`Delete token "${t.name}"?`}
                                hx-target="closest tr"
                                hx-swap="outerHTML"
                              >
                                <IconTrash width={12} height={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: Team Members (Admin Only) ─── */}
        {isAdmin && (
          <div x-show="activeTab === 'users'" x-cloak class="settings-section">
            <div class="settings-card">
              <div class="settings-card-header">
                <div>
                  <h2 class="settings-card-title">Team Members</h2>
                  <p class="settings-card-desc">Active portal user accounts and assigned roles.</p>
                </div>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  x-on:click="showInviteForm = !showInviteForm"
                >
                  <IconPlus width={13} height={13} />
                  <span x-text="showInviteForm ? 'Close Form' : 'Invite User'">Invite User</span>
                </button>
              </div>

              {/* Invite Form (Collapsible) */}
              <div x-show="showInviteForm" class="settings-card-body settings-collapsible-drawer">
                <form
                  hx-post="/api/users/invite"
                  hx-target="#invite-feedback"
                  hx-swap="innerHTML"
                  class="settings-section"
                  autocomplete="off"
                  {...{
                    'hx-on::before-request': 'var fb = document.getElementById("invite-feedback"); if (fb) fb.innerHTML = "";',
                    'hx-on::before-swap': 'if (event.detail.xhr && event.detail.xhr.status >= 400) { event.detail.shouldSwap = true; event.detail.isError = false; }',
                    'hx-on::after-request': 'if (event.detail.xhr && event.detail.xhr.status === 200) { this.reset(); setTimeout(() => window.location.reload(), 1400); }'
                  }}
                >
                  <div id="invite-feedback"></div>

                  <div class="form-row-2">
                    <div class="form-group">
                      <label class="form-label" for="new-username">Username</label>
                      <input
                        id="new-username"
                        type="text"
                        name="username"
                        required
                        autocomplete="off"
                        placeholder="john.doe"
                        class="input font-mono"
                      />
                    </div>

                    <div class="form-group">
                      <label class="form-label" for="new-role">Role</label>
                      <select id="new-role" name="role" class="select">
                        <option value="viewer">Viewer (Read &amp; Sandbox)</option>
                        <option value="editor">Editor (Upload &amp; SCM)</option>
                        <option value="admin">Admin (Full Control)</option>
                      </select>
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="new-email">Email Address</label>
                    <input
                      id="new-email"
                      type="email"
                      name="email"
                      required
                      autocomplete="off"
                      placeholder="user@example.com"
                      class="input"
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="new-pwd-input">Initial Password</label>
                    <input
                      id="new-pwd-input"
                      type="password"
                      name="password"
                      required
                      minLength={6}
                      autocomplete="new-password"
                      placeholder="Minimum 6 characters"
                      class="input"
                    />
                  </div>

                  <div class="settings-form-actions">
                    <button type="submit" class="btn btn-primary btn-sm">
                      <span>Create User</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      x-on:click="showInviteForm = false"
                    >
                      <span>Cancel</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Members Table */}
              <div class="settings-table-wrapper">
                <table class="settings-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td class="font-mono font-semibold text-main">{u.username}</td>
                        <td class="text-muted">{u.email}</td>
                        <td>
                          <span class="role-badge-mono">{u.role.toUpperCase()}</span>
                        </td>
                        <td class="font-mono text-muted font-sm">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
