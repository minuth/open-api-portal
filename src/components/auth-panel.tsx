import { jsx } from 'hono/jsx'
import { EndpointOperation, OpenApiDocument } from '../types/openapi'
import { ResolvedSecuritySchemeInfo } from '../types/auth'
import { IconLock, IconUnlock, IconKey, IconEye, IconEyeOff, IconCheck, IconShield } from './icons'
import { formatSchemeDisplay } from '../utils/auth-metadata'

export interface AuthPanelProps {
  spec: OpenApiDocument
  endpoint: EndpointOperation
  securityInfo: {
    isSecured: boolean
    isExplicitlyUnsecured: boolean
    schemes: ResolvedSecuritySchemeInfo[]
    primaryScheme?: ResolvedSecuritySchemeInfo
  }
}

export function AuthPanel({ endpoint, securityInfo }: AuthPanelProps) {
  const isSecured = securityInfo.isSecured
  const schemes = securityInfo.schemes
  const primaryScheme = securityInfo.primaryScheme

  // 1. Endpoint defines NO security schemes in OpenAPI spec (Public Endpoint)
  if (!isSecured || schemes.length === 0) {
    return (
      <div class="auth-panel-container">
        <div class="auth-header-bar">
          <div class="auth-title-group">
            <div class="auth-title-row">
              <span class="auth-title-icon">
                <IconShield width={14} height={14} class="text-accent" />
              </span>
              <span class="auth-title-text">Authentication</span>
              <span class="badge badge-subtle">
                <IconUnlock width={10} height={10} />
                Public Endpoint
              </span>
            </div>
            <span class="text-subtle auth-subtitle">
              No authentication required for this endpoint
            </span>
          </div>
        </div>

        <div class="auth-empty-banner">
          <IconUnlock width={18} height={18} class="text-subtle" />
          <div class="auth-empty-text-group">
            <span class="auth-empty-title">No Authentication Required</span>
            <span class="text-subtle">
              This endpoint does not declare any security schemes in the OpenAPI specification. All requests are sent unauthenticated.
            </span>
          </div>
        </div>
      </div>
    )
  }

  const primaryDisplay = primaryScheme ? formatSchemeDisplay(primaryScheme) : null

  return (
    <div class="auth-panel-container">
      {/* 1. Header Bar: Title, Security Status, Unauthenticated Toggle & Manage Spec Auth */}
      <div class="auth-header-bar">
        <div class="auth-title-group">
          <div class="auth-title-row">
            <IconShield width={14} height={14} class="text-accent" />
            <span class="auth-title-text">Authentication</span>
            <span class="badge badge-security" x-show="!auth.disabled">
              <IconLock width={10} height={10} />
              Secured
            </span>
            <span class="badge badge-warning" x-show="auth.disabled" x-cloak>
              <IconUnlock width={10} height={10} />
              Unauthenticated
            </span>
          </div>
          <span class="text-subtle auth-subtitle">
            Defined by OpenAPI specification
          </span>
        </div>

        <div class="auth-actions-group">
          <label class="auth-unauth-toggle" title="Send request without credentials (test 401 response)">
            <input type="checkbox" class="checkbox" x-model="auth.disabled" />
            <span>Send unauthenticated</span>
          </label>
          <button
            type="button"
            class="btn btn-secondary btn-xs auth-global-btn"
            x-on:click="$dispatch('open-auth-modal')"
            title="Configure spec-wide credentials"
          >
            <IconKey width={12} height={12} />
            <span>Manage Spec Auth</span>
          </button>
        </div>
      </div>

      {/* 2. Unauthenticated Notice (when toggle active) */}
      <div class="auth-disabled-banner" x-show="auth.disabled" x-cloak>
        <IconUnlock width={14} height={14} />
        <span>Authentication disabled for this request. Outgoing request will be sent without credentials.</span>
      </div>

      {/* 3. Single Unified Credential Card */}
      <div class="auth-card" x-show="!auth.disabled">
        {/* Card Header: Scheme info + Scopes + Hint + Clear action */}
        <div class="auth-field-header">
          <div class="auth-field-label-group">
            {schemes.length === 1 && primaryScheme && primaryDisplay && (
              <>
                <span class="auth-scheme-name">{primaryScheme.name}</span>
                <span class="auth-type-pill">{primaryDisplay.typeLabel}</span>
              </>
            )}
            {schemes.length > 1 && (
              <div class="auth-scheme-select-group">
                <select
                  class="select select-sm auth-scheme-select"
                  x-model="auth.schemeName"
                  x-on:change="selectEndpointScheme($event.target.value)"
                >
                  {schemes.map((s) => {
                    const d = formatSchemeDisplay(s)
                    return (
                      <option key={s.name} value={s.name}>
                        {s.name} ({d.typeLabel})
                      </option>
                    )
                  })}
                </select>
              </div>
            )}
            <template x-if="authDeclaredScopes && authDeclaredScopes.length > 0">
              <div class="auth-scopes-inline">
                <template x-for="scope in authDeclaredScopes" x-bind:key="scope">
                  <span class="badge badge-scope">
                    <IconCheck width={10} height={10} />
                    <span x-text="scope"></span>
                  </span>
                </template>
              </div>
            </template>
          </div>

          <div class="auth-field-meta-right">
            <span
              class="auth-field-hint"
              x-show="auth.type === 'bearer' || auth.type === 'oauth2' || auth.type === 'openIdConnect'"
            >
              Header: Authorization: Bearer &lt;token&gt;
            </span>
            <span
              class="auth-field-hint"
              x-show="auth.type === 'apiKey'"
              x-text="(auth.apiKeyPlacement === 'query' ? 'Query: ?' : auth.apiKeyPlacement === 'cookie' ? 'Cookie: ' : 'Header: ') + (auth.apiKeyName || 'api_key')"
            ></span>
            <span
              class="auth-field-hint"
              x-show="auth.type === 'basic'"
            >
              Header: Authorization: Basic &lt;base64&gt;
            </span>
            <button
              type="button"
              class="btn-text-action"
              x-show="auth.token || auth.apiKeyValue || auth.username || auth.password"
              x-on:click="auth.token = ''; auth.apiKeyValue = ''; auth.username = ''; auth.password = ''; jwtClaims = null"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Scheme Description if defined in spec */}
        <div
          class="text-subtle font-sm"
          x-show="authSchemeDescription"
          x-text="authSchemeDescription"
          x-cloak
        ></div>

        {/* Bearer Token Input */}
        <div x-show="auth.type === 'bearer' || auth.type === 'oauth2' || auth.type === 'openIdConnect'" x-cloak>
          <div class="auth-token-input-group">
            <span class="auth-static-prefix-addon">Bearer</span>
            <input
              x-bind:type="showAuthSecret ? 'text' : 'password'"
              class="input input-mono auth-token-input-with-prefix"
              x-model="auth.token"
              x-on:input="if (auth.token && auth.token.startsWith('Bearer ')) { auth.token = auth.token.slice(7); } updateJwtInspector()"
              placeholder="Paste token or JWT"
            />
            <button
              type="button"
              class="btn-eye-toggle"
              x-on:click="showAuthSecret = !showAuthSecret"
              x-bind:title="showAuthSecret ? 'Hide secret token' : 'Show secret token'"
            >
              <IconEye x-show="!showAuthSecret" />
              <IconEyeOff x-show="showAuthSecret" x-cloak />
            </button>
          </div>

          {/* Live JWT Claims Inspector Box */}
          <div class="jwt-inspector-box" x-show="jwtClaims && jwtClaims.valid" x-cloak>
            <div class="jwt-inspector-header">
              <div class="jwt-header-left">
                <span class="jwt-tag">Decoded JWT</span>
                <span
                  class="badge jwt-exp-badge"
                  x-bind:class="jwtClaims && jwtClaims.isExpired ? 'jwt-expired' : 'jwt-active'"
                  x-text="jwtClaims ? jwtClaims.expiresIn : ''"
                ></span>
              </div>
              <button
                type="button"
                class="btn-text-action"
                x-on:click="showJwtDetails = !showJwtDetails"
                x-text="showJwtDetails ? 'Hide Claims' : 'View Claims JSON'"
              ></button>
            </div>

            <div class="jwt-meta-summary">
              <div class="jwt-summary-item" x-show="jwtClaims && jwtClaims.sub">
                <span class="jwt-key">sub:</span>
                <span class="jwt-val" x-text="jwtClaims ? jwtClaims.sub : ''"></span>
              </div>
              <div class="jwt-summary-item" x-show="jwtClaims && jwtClaims.iss">
                <span class="jwt-key">iss:</span>
                <span class="jwt-val" x-text="jwtClaims ? jwtClaims.iss : ''"></span>
              </div>
              <div class="jwt-summary-item" x-show="jwtClaims && jwtClaims.aud">
                <span class="jwt-key">aud:</span>
                <span class="jwt-val" x-text="jwtClaims ? jwtClaims.aud : ''"></span>
              </div>
            </div>

            <div class="jwt-details-expand" x-show="showJwtDetails" x-cloak>
              <div class="jwt-json-label">Header:</div>
              <pre class="jwt-code-block" x-text="jwtClaims ? jwtClaims.formattedHeader : ''"></pre>
              <div class="jwt-json-label">Payload:</div>
              <pre class="jwt-code-block" x-text="jwtClaims ? jwtClaims.formattedPayload : ''"></pre>
            </div>
          </div>
        </div>

        {/* API Key Input */}
        <div x-show="auth.type === 'apiKey'" x-cloak>
          <div class="auth-input-with-eye">
            <input
              x-bind:type="showAuthSecret ? 'text' : 'password'"
              class="input input-mono"
              x-model="auth.apiKeyValue"
              x-bind:placeholder="'Value for ' + (auth.apiKeyName || 'API Key')"
            />
            <button
              type="button"
              class="btn-eye-toggle"
              x-on:click="showAuthSecret = !showAuthSecret"
              x-bind:title="showAuthSecret ? 'Hide secret' : 'Show secret'"
            >
              <IconEye x-show="!showAuthSecret" />
              <IconEyeOff x-show="showAuthSecret" x-cloak />
            </button>
          </div>
        </div>

        {/* Basic Auth Input */}
        <div x-show="auth.type === 'basic'" x-cloak>
          <div class="auth-modal-input-grid">
            <div>
              <input
                type="text"
                class="input"
                x-model="auth.username"
                placeholder="Username"
              />
            </div>
            <div>
              <div class="auth-input-with-eye">
                <input
                  x-bind:type="showAuthSecret ? 'text' : 'password'"
                  class="input"
                  x-model="auth.password"
                  placeholder="Password"
                />
                <button
                  type="button"
                  class="btn-eye-toggle"
                  x-on:click="showAuthSecret = !showAuthSecret"
                  x-bind:title="showAuthSecret ? 'Hide password' : 'Show password'"
                >
                  <IconEye x-show="!showAuthSecret" />
                  <IconEyeOff x-show="showAuthSecret" x-cloak />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
