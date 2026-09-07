import { jsx } from 'hono/jsx'
import { IconUserPlus, IconShield, IconClose } from './icons'
import { UserRecord } from '../db/schema'

export interface InviteModalProps {
  users?: UserRecord[]
}

export function InviteModal({ users = [] }: InviteModalProps) {
  return (
    <div
      class="modal-backdrop"
      x-show="show"
      x-cloak
      x-data="{ show: false, tab: 'invite' }"
      {...{
        'x-on:open-invite-modal.window': 'show = true',
        'x-on:keydown.escape.window': 'show = false'
      }}
    >
      <div
        class="modal-card modal-card-wide"
        {...{
          'x-show': 'show',
          'x-transition:enter': 'transition ease-out duration-150',
          'x-transition:enter-start': 'opacity-0 transform scale-95',
          'x-transition:enter-end': 'opacity-100 transform scale-100'
        }}
      >
        <div class="modal-header">
          <h2 class="modal-title">
            <IconUserPlus width={16} height={16} />
            User Management &amp; Invitation
          </h2>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="show = false"
            aria-label="Close dialog"
          >
            <IconClose width={14} height={14} />
          </button>
        </div>

        <div class="modal-tab-bar">
          <button
            type="button"
            class="modal-tab-btn"
            x-bind:class="tab === 'invite' ? 'active' : ''"
            x-on:click="tab = 'invite'"
          >
            Invite New User
          </button>
          <button
            type="button"
            class="modal-tab-btn"
            x-bind:class="tab === 'list' ? 'active' : ''"
            x-on:click="tab = 'list'"
          >
            Existing Users ({users.length})
          </button>
        </div>

        <div id="invite-alert"></div>

        {/* Invite Form Tab */}
        <div x-show="tab === 'invite'">
          <form
            hx-post="/api/users/invite"
            hx-target="#invite-alert"
            hx-swap="innerHTML"
          >
            <div class="form-group">
              <div class="form-field">
                <label class="form-label" for="invite-username">
                  Username *
                </label>
                <input
                  id="invite-username"
                  name="username"
                  type="text"
                  class="input"
                  placeholder="e.g. john_doe"
                  required
                />
              </div>

              <div class="form-field">
                <label class="form-label" for="invite-email">
                  Email Address *
                </label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  class="input"
                  placeholder="e.g. john@company.com"
                  required
                />
              </div>

              <div class="form-field">
                <label class="form-label" for="invite-role">
                  Role &amp; Permissions *
                </label>
                <select id="invite-role" name="role" class="select" required>
                  <option value="editor">Editor (Full access except inviting users)</option>
                  <option value="viewer">Viewer (Read &amp; interact only + private sandbox specs)</option>
                  <option value="admin">Admin (Full administrative rights)</option>
                </select>
                <div class="form-help-text">
                  <strong>Role Access Summary:</strong>
                  <ul>
                    <li><strong>Admin:</strong> Upload specs, config SCM tokens, invite users.</li>
                    <li><strong>Editor:</strong> Upload specs, config SCM tokens (cannot invite users).</li>
                    <li><strong>Viewer:</strong> View &amp; test APIs, upload private sandbox specs.</li>
                  </ul>
                </div>
              </div>

              <div class="form-field">
                <label class="form-label" for="invite-password">
                  Initial Password *
                </label>
                <input
                  id="invite-password"
                  name="password"
                  type="password"
                  class="input"
                  placeholder="Set initial password for user"
                  required
                />
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" x-on:click="show = false">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary">
                Create / Invite User
              </button>
            </div>
          </form>
        </div>

        {/* User List Tab */}
        <div x-show="tab === 'list'">
          <div id="user-list-container" hx-get="/api/users" hx-trigger="open-invite-modal from:body">
            <div class="user-table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td class="font-mono">{u.username}</td>
                      <td>{u.email}</td>
                      <td>
                        <span class={`role-badge role-badge-${u.role}`}>
                          <IconShield width={12} height={12} /> {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td class="font-mono text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" x-on:click="show = false">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
