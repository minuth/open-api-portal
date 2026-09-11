import { jsx } from 'hono/jsx'
import { OpenApiDocument } from '../types/openapi'
import { IconClose, IconLock, IconEye, IconEyeOff, IconCheck, IconShield } from './icons'

export interface AuthModalProps {
  spec?: OpenApiDocument
}

export function AuthModal({ spec }: AuthModalProps) {
  const specId = spec?.id || ''
  const specSchemes = spec?.securitySchemes || {}
  const schemeNames = Object.keys(specSchemes)

  // Identify declared schemes by category from OpenAPI specification
  const bearerSchemes = schemeNames
    .map((key) => ({ key, scheme: specSchemes[key] }))
    .filter(
      ({ scheme: s }) =>
        s.type === 'bearer' ||
        s.type === 'oauth2' ||
        s.type === 'openIdConnect' ||
        (s.type === 'http' && s.scheme?.toLowerCase() === 'bearer')
    )

  const apiKeySchemes = schemeNames
    .map((key) => ({ key, scheme: specSchemes[key] }))
    .filter(({ scheme: s }) => s.type === 'apiKey')

  const basicSchemes = schemeNames
    .map((key) => ({ key, scheme: specSchemes[key] }))
    .filter(
      ({ scheme: s }) =>
        s.type === 'basic' ||
        (s.type === 'http' && s.scheme?.toLowerCase() === 'basic')
    )

  const hasBearer = bearerSchemes.length > 0
  const hasApiKey = apiKeySchemes.length > 0
  const hasBasic = basicSchemes.length > 0

  const primaryApiKey = apiKeySchemes[0]
  const defaultApiKeyName = primaryApiKey?.scheme.name || primaryApiKey?.key || 'api_key'
  const defaultApiKeyPlacement = primaryApiKey?.scheme.in || 'header'

  return (
    <div
      class="modal-backdrop"
      x-data={`{
        open: false,
        specId: '${specId}',
        schemes: ${JSON.stringify(specSchemes)},
        authStore: {
          bearerToken: '',
          apiKeyName: '${defaultApiKeyName}',
          apiKeyValue: '',
          apiKeyPlacement: '${defaultApiKeyPlacement}',
          basicUser: '',
          basicPass: ''
        },
        showSecret: false,
        isSaved: false,

        init() {
          this.loadFromStorage();
          window.addEventListener('open-auth-modal', () => {
            this.loadFromStorage();
            this.open = true;
          });
        },

        loadFromStorage() {
          if (!this.specId) return;
          const stored = window.getSpecAuth ? window.getSpecAuth(this.specId) : null;
          if (stored) {
            this.authStore = { ...this.authStore, ...stored };
            this.isSaved = Boolean(this.authStore.bearerToken || this.authStore.apiKeyValue || this.authStore.basicUser);
          } else {
            this.isSaved = false;
          }
          if (!this.authStore.apiKeyName) {
            this.authStore.apiKeyName = '${defaultApiKeyName}';
          }
          if (!this.authStore.apiKeyPlacement) {
            this.authStore.apiKeyPlacement = '${defaultApiKeyPlacement}';
          }
        },

        saveAuth() {
          if (window.saveSpecAuth) {
            window.saveSpecAuth(this.specId, this.authStore);
          }
          this.isSaved = true;
          this.open = false;
          window.dispatchEvent(new CustomEvent('spec-auth-updated', { detail: this.authStore }));
        },

        clearAuth() {
          this.authStore = {
            bearerToken: '',
            apiKeyName: '${defaultApiKeyName}',
            apiKeyValue: '',
            apiKeyPlacement: '${defaultApiKeyPlacement}',
            basicUser: '',
            basicPass: ''
          };
          if (window.saveSpecAuth) {
            window.saveSpecAuth(this.specId, null);
          }
          this.isSaved = false;
          window.dispatchEvent(new CustomEvent('spec-auth-updated', { detail: null }));
        }
      }`}
      x-show="open"
      x-cloak
      {...{
        'x-on:keydown.escape.window': 'open = false'
      }}
    >
      <div
        class="modal-card auth-modal-card"
        {...{
          'x-on:click.away': 'open = false',
          'x-transition:enter': 'transition ease-out duration-150',
          'x-transition:enter-start': 'opacity-0 transform scale-95',
          'x-transition:enter-end': 'opacity-100 transform scale-100'
        }}
      >
        {/* Modal Header */}
        <div class="modal-header">
          <h2 class="modal-title">
            <IconLock width={16} height={16} />
            <span>Spec Authorization</span>
          </h2>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="open = false"
            aria-label="Close dialog"
          >
            <IconClose width={14} height={14} />
          </button>
        </div>

        <p class="modal-subtitle">
          Authorize all endpoints in <strong>{spec?.title || 'this specification'}</strong>.
        </p>

        {/* Modal Body: Minimal, strictly spec-driven form */}
        <div class="auth-modal-fields">
          {hasBearer && (
            <div class="form-group">
              <div class="auth-field-header">
                <div class="auth-field-label-group">
                  <label class="form-label">
                    {bearerSchemes.map((s) => s.key).join(', ') || 'Bearer Token'}
                  </label>
                  <span class="auth-type-pill">
                    {bearerSchemes[0]?.scheme.type === 'oauth2' ? 'OAuth 2.0' : 'Bearer'}
                  </span>
                </div>
                <span class="auth-field-hint">Header: Authorization: Bearer &lt;token&gt;</span>
              </div>
              <div class="auth-token-input-group">
                <span class="auth-static-prefix-addon">Bearer</span>
                <input
                  x-bind:type="showSecret ? 'text' : 'password'"
                  class="input input-mono auth-token-input-with-prefix"
                  placeholder="Paste token or JWT"
                  x-model="authStore.bearerToken"
                  x-on:input="if (authStore.bearerToken && authStore.bearerToken.startsWith('Bearer ')) { authStore.bearerToken = authStore.bearerToken.slice(7); }"
                />
                <button
                  type="button"
                  class="btn-eye-toggle"
                  x-on:click="showSecret = !showSecret"
                  x-bind:title="showSecret ? 'Hide secret' : 'Show secret'"
                >
                  <IconEye x-show="!showSecret" />
                  <IconEyeOff x-show="showSecret" x-cloak />
                </button>
              </div>
            </div>
          )}

          {hasApiKey && (
            <div class="form-group">
              <div class="auth-field-header">
                <div class="auth-field-label-group">
                  <label class="form-label">
                    {apiKeySchemes.map((s) => s.key).join(', ') || 'API Key'}
                  </label>
                  <span class="auth-type-pill">API Key</span>
                </div>
                <span
                  class="auth-field-hint"
                  x-text="(authStore.apiKeyPlacement === 'query' ? 'Query: ?' : authStore.apiKeyPlacement === 'cookie' ? 'Cookie: ' : 'Header: ') + authStore.apiKeyName"
                ></span>
              </div>
              <div class="auth-input-with-eye">
                <input
                  x-bind:type="showSecret ? 'text' : 'password'"
                  class="input input-mono"
                  x-model="authStore.apiKeyValue"
                  x-bind:placeholder="'Value for ' + (authStore.apiKeyName || 'API Key')"
                />
                <button
                  type="button"
                  class="btn-eye-toggle"
                  x-on:click="showSecret = !showSecret"
                  x-bind:title="showSecret ? 'Hide secret' : 'Show secret'"
                >
                  <IconEye x-show="!showSecret" />
                  <IconEyeOff x-show="showSecret" x-cloak />
                </button>
              </div>
            </div>
          )}

          {hasBasic && (
            <div class="form-group">
              <div class="auth-field-header">
                <div class="auth-field-label-group">
                  <label class="form-label">
                    {basicSchemes.map((s) => s.key).join(', ') || 'Basic Auth'}
                  </label>
                  <span class="auth-type-pill">HTTP Basic</span>
                </div>
                <span class="auth-field-hint">Header: Authorization: Basic &lt;base64&gt;</span>
              </div>
              <div class="auth-modal-input-grid">
                <div>
                  <input
                    type="text"
                    class="input"
                    placeholder="Username"
                    x-model="authStore.basicUser"
                    autocomplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                </div>
                <div>
                  <div class="auth-input-with-eye">
                    <input
                      x-bind:type="showSecret ? 'text' : 'password'"
                      class="input"
                      placeholder="Password"
                      x-model="authStore.basicPass"
                      autocomplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                    />
                    <button
                      type="button"
                      class="btn-eye-toggle"
                      x-on:click="showSecret = !showSecret"
                      x-bind:title="showSecret ? 'Hide secret' : 'Show secret'"
                    >
                      <IconEye x-show="!showSecret" />
                      <IconEyeOff x-show="showSecret" x-cloak />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!hasBearer && !hasApiKey && !hasBasic && (
            <div class="auth-modal-notice">
              <IconShield width={14} height={14} class="text-subtle" />
              <span>This specification does not declare explicit security schemes.</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="clearAuth()"
            x-show="isSaved"
            x-cloak
          >
            <span>Clear</span>
          </button>
          <div class="modal-footer-spacer"></div>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="open = false"
          >
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            x-on:click="saveAuth()"
          >
            <IconCheck width={12} height={12} />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  )
}
