import { jsx } from 'hono/jsx'
import { IconClose, IconKey } from './icons'

export function PasswordModal() {
  return (
    <div
      class="modal-backdrop"
      x-show="show"
      x-cloak
      x-data="{ show: false }"
      {...{
        'x-on:open-password-modal.window': 'show = true',
        'x-on:keydown.escape.window': 'show = false'
      }}
    >
      <div
        class="modal-card modal-card-compact"
        {...{
          'x-show': 'show',
          'x-transition:enter': 'transition ease-out duration-150',
          'x-transition:enter-start': 'opacity-0 transform scale-95',
          'x-transition:enter-end': 'opacity-100 transform scale-100'
        }}
      >
        <div class="modal-header">
          <h2 class="modal-title">
            <IconKey width={16} height={16} />
            Change Password
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

        <form
          hx-post="/api/auth/change-password"
          hx-target="#password-feedback"
          hx-swap="innerHTML"
          hx-indicator="#password-submit-btn"
          hx-disabled-elt="#password-submit-btn"
          {...{
            'hx-on::after-request': `if (event.detail.successful) {
              this.reset();
              setTimeout(() => {
                show = false;
                var fb = document.getElementById('password-feedback');
                if (fb) fb.innerHTML = '';
              }, 1400);
            }`
          }}
        >
          <div id="password-feedback"></div>

          <div class="form-group">
            <label class="form-label" for="current-password-input">
              Current Password
            </label>
            <input
              id="current-password-input"
              type="password"
              name="currentPassword"
              required
              autocomplete="current-password"
              placeholder="Enter current password"
              class="input"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="new-password-input">
              New Password
            </label>
            <input
              id="new-password-input"
              type="password"
              name="newPassword"
              required
              minLength={6}
              autocomplete="new-password"
              placeholder="Minimum 6 characters"
              class="input"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="confirm-password-input">
              Confirm New Password
            </label>
            <input
              id="confirm-password-input"
              type="password"
              name="confirmPassword"
              required
              minLength={6}
              autocomplete="new-password"
              placeholder="Re-enter new password"
              class="input"
            />
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              x-on:click="show = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="password-submit-btn"
              class="btn btn-primary"
            >
              <span class="htmx-indicator btn-spinner" aria-hidden="true"></span>
              <span class="btn-label-idle">Update Password</span>
              <span class="htmx-indicator btn-label-loading">Updating…</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
