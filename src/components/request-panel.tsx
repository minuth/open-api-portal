import { jsx } from 'hono/jsx'
import { randomUUID } from 'node:crypto'
import { EndpointOperation, OpenApiDocument, ParameterItem, SchemaObject, ServerItem } from '../types/openapi'
import { JoseSecurityExtension, JoseValueType, JoseTypedValueDescriptor } from '../types/jose'
import { MethodBadge } from './method-badge'
import { IconPlay, IconLock, IconRefresh, IconClose, IconShield, IconKey, IconCheck } from './icons'
import {
  describeSignatureAlgorithm,
  describeEncryptionAlgorithm,
  describeContentCipher
} from '../utils/jose-metadata'
import { resolveEndpointSecurity } from '../utils/auth-metadata'
import { AuthPanel } from './auth-panel'

export interface RequestPanelProps {
  spec: OpenApiDocument
  endpoint: EndpointOperation
}

function JoseSecurityBar({ joseSecurity }: { joseSecurity: JoseSecurityExtension }) {
  const sigDesc = joseSecurity.sign ? describeSignatureAlgorithm(joseSecurity.sign.alg) : null
  const encDesc = joseSecurity.encrypt ? describeEncryptionAlgorithm(joseSecurity.encrypt.alg) : null
  const cipherDesc = joseSecurity.encrypt ? describeContentCipher(joseSecurity.encrypt.enc) : null
  const defaultKid = joseSecurity.sign?.kid || joseSecurity.encrypt?.kid || ''

  return (
    <div class="jose-minimal-bar">
      <div class="jose-minimal-left">
        <span class="jose-minimal-title">
          <IconLock width={12} height={12} class="text-purple" />
          JOSE: {joseSecurity.mode?.toUpperCase()}
        </span>

        {sigDesc && (
          <>
            <span class="jose-minimal-sep">|</span>
            <div class="jose-minimal-item">
              <span>Sign:</span>
              <code class="jose-mono-tag">{sigDesc.alg}</code>
              <span class="text-muted">({sigDesc.family})</span>
              <span class="text-subtle">&rarr; {joseSecurity.sign?.placement === 'body' ? 'Body' : (joseSecurity.sign?.headerName || 'X-Signature')}</span>
              <span
                class="badge badge-subtle"
                title="Critical Header Parameters (RFC 7515 §4.1.11)"
                x-show="joseSignHeaders && joseSignHeaders.some(h => h.enabled && h.isCrit && h.key)"
                x-text="'crit: [' + joseSignHeaders.filter(h => h.enabled && h.isCrit && h.key).map(h => h.key).join(', ') + ']'"
              >
                {joseSecurity.sign?.crit && joseSecurity.sign.crit.length > 0 ? `crit: [${joseSecurity.sign.crit.join(', ')}]` : ''}
              </span>
            </div>
          </>
        )}

        {encDesc && (
          <>
            <span class="jose-minimal-sep">|</span>
            <div class="jose-minimal-item">
              <span>Encrypt:</span>
              <code class="jose-mono-tag">{encDesc.alg} / {cipherDesc?.enc}</code>
              {joseSecurity.encrypt?.placement === 'field' ? (
                <span class="text-subtle">&rarr; Field: {joseSecurity.encrypt.targetField || 'encData'}</span>
              ) : joseSecurity.encrypt?.placement === 'header' ? (
                <span class="text-subtle">&rarr; Header: {joseSecurity.encrypt.headerName || 'X-Encrypted-Payload'}</span>
              ) : (
                <span class="text-subtle">&rarr; Body</span>
              )}
              {joseSecurity.encrypt?.placement === 'field' && joseSecurity.encrypt.fields && (
                <span class="badge badge-subtle">
                  {joseSecurity.encrypt.fields.join(', ')}
                </span>
              )}
              <span
                class="badge badge-subtle"
                title="Critical Header Parameters (RFC 7516 §4.1.13)"
                x-show="joseEncHeaders && joseEncHeaders.some(h => h.enabled && h.isCrit && h.key)"
                x-text="'crit: [' + joseEncHeaders.filter(h => h.enabled && h.isCrit && h.key).map(h => h.key).join(', ') + ']'"
              >
                {joseSecurity.encrypt?.crit && joseSecurity.encrypt.crit.length > 0 ? `crit: [${joseSecurity.encrypt.crit.join(', ')}]` : ''}
              </span>
            </div>
          </>
        )}

        {(joseSecurity.computeDigest || joseSecurity.digestInPayload || joseSecurity.sign?.digestInPayload) && (
          <>
            <span class="jose-minimal-sep">|</span>
            <div class="jose-minimal-item">
              <span>Digest:</span>
              <code class="jose-mono-tag">{joseSecurity.digestAlgorithm || joseSecurity.sign?.digestAlgorithm || 'SHA-256'}</code>
              {joseSecurity.computeDigest && (
                <span class="text-subtle">&rarr; {joseSecurity.digestHeaderName || 'Digest'}</span>
              )}
              {(joseSecurity.digestInPayload || joseSecurity.sign?.digestInPayload) && (
                <span class="badge badge-subtle" title="Digest injected into JWS token claims">
                  payload.{joseSecurity.digestClaimName || joseSecurity.sign?.digestClaimName || 'digest'}
                </span>
              )}
            </div>
          </>
        )}

        {joseSecurity.mode === 'both' ? (
          <>
            <span class="jose-minimal-sep" x-show="joseSigningKid || joseEncryptionKid">|</span>
            <div class="jose-minimal-item" x-show="joseSigningKid || joseEncryptionKid">
              <span>kid:</span>
              <code class="jose-mono-tag" x-show="joseSigningKid" x-text="joseSigningKid">{joseSecurity.sign?.kid}</code>
              <template x-if="joseSigningKid && joseEncryptionKid">
                <span class="text-subtle">/</span>
              </template>
              <code class="jose-mono-tag" x-show="joseEncryptionKid" x-text="joseEncryptionKid">{joseSecurity.encrypt?.kid}</code>
            </div>
          </>
        ) : (
          <>
            <span class="jose-minimal-sep" x-show="joseKid">|</span>
            <div class="jose-minimal-item" x-show="joseKid">
              <span>kid:</span>
              <code class="jose-mono-tag" x-text="joseKid">{defaultKid}</code>
            </div>
          </>
        )}
      </div>

      <div class="jose-minimal-right">
        {defaultKid && (
          <div class="jose-minimal-item" title={`Key ID: ${defaultKid}`}>
            <IconKey width={12} height={12} class="text-subtle" />
            <span class="text-subtle">kid:</span>
            <span class="mono-truncate">{defaultKid}</span>
          </div>
        )}
        <span
          class="jose-status-indicator active"
          title="Interactive JOSE Security Panel active below"
        >
          <span class="indicator-dot active"></span>
          Ready
        </span>
      </div>
    </div>
  )
}

function parseTypedEntry(key: string, rawVal: unknown): {
  key: string
  value: string
  type: JoseValueType
  autoNow: boolean
  required: boolean
} {
  if (typeof rawVal === 'object' && rawVal !== null && 'type' in rawVal) {
    const desc = rawVal as JoseTypedValueDescriptor
    const type: JoseValueType = desc.type || 'text'
    const autoNow = Boolean(desc.autoNow)
    const required = Boolean(desc.required)
    let valStr = desc.value !== undefined ? String(desc.value) : ''
    if (!valStr) {
      if (type === 'uuid') {
        valStr = randomUUID()
      } else if (type === 'boolean') {
        valStr = 'true'
      } else if (autoNow) {
        if (type === 'unix') valStr = String(Math.floor(Date.now() / 1000))
        else if (type === 'datetime') valStr = new Date().toISOString().slice(0, 16)
        else if (type === 'date') valStr = new Date().toISOString().split('T')[0]
      }
    }
    return { key, value: valStr, type, autoNow, required }
  }

  if (typeof rawVal === 'object' && rawVal !== null && 'required' in rawVal) {
    const desc = rawVal as { required?: boolean; value?: unknown; type?: JoseValueType; autoNow?: boolean }
    return {
      key,
      value: String(desc.value ?? ''),
      type: desc.type || 'text',
      autoNow: Boolean(desc.autoNow),
      required: Boolean(desc.required)
    }
  }

  if (typeof rawVal === 'boolean') {
    return { key, value: String(rawVal), type: 'boolean', autoNow: false, required: false }
  }

  if (key === 'jti') {
    return { key, value: String(rawVal || randomUUID()), type: 'uuid', autoNow: false, required: false }
  }

  if (typeof rawVal === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawVal)) {
    return { key, value: rawVal, type: 'uuid', autoNow: false, required: false }
  }

  if ((key === 'iat' || key === 'exp' || key === 'nbf') && (typeof rawVal === 'number' || (typeof rawVal === 'string' && /^\d{10}$/.test(rawVal)))) {
    return { key, value: String(rawVal), type: 'unix', autoNow: false, required: false }
  }

  return {
    key,
    value: typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal ?? ''),
    type: 'text',
    autoNow: false,
    required: false
  }
}

interface JoseProtectedHeadersBuilderProps {
  title: string
  subtitle: string
  headersVar: string
  placeholderKey: string
  emptyText: string
}

function JoseProtectedHeadersBuilder({
  title,
  subtitle,
  headersVar,
  placeholderKey,
  emptyText
}: JoseProtectedHeadersBuilderProps) {
  return (
    <div class="jose-headers-section">
      <div class="kv-builder-header">
        <div class="jose-header-label-wrap">
          <span class="form-label">{title}</span>
          <span class="text-subtle jose-headers-subtitle">{subtitle}</span>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-xs"
          x-on:click={`${headersVar}.push({ key: '', value: '', type: 'text', autoNow: false, isCrit: false, enabled: true, fromSpec: false, required: false })`}
        >
          + Add Header
        </button>
      </div>

      <template x-if={`${headersVar}.length === 0`}>
        <div class="jose-headers-empty">
          {emptyText}
        </div>
      </template>

      <template x-for={`(h, idx) in ${headersVar}`} x-bind:key="idx">
        <div class="jose-kv-row">
          <input
            type="checkbox"
            class="checkbox"
            x-model="h.enabled"
            x-bind:disabled="h.required || h.isCrit"
            title="Enable / Disable header parameter"
          />
          <input
            type="text"
            x-bind:class="h.fromSpec ? 'input-bare input-bare-readonly' : 'input-bare'"
            placeholder={placeholderKey}
            x-model="h.key"
            x-bind:readonly="h.fromSpec"
          />
          <template x-if="h.fromSpec">
            <span class="jose-type-badge" x-text="h.type === 'boolean' ? 'bool' : h.type"></span>
          </template>
          <template x-if="!h.fromSpec">
            <select
              class="jose-type-select"
              x-model="h.type"
              x-on:change={`
                if (h.type === 'uuid' && (!h.value || !h.value.includes('-'))) { h.value = crypto.randomUUID(); }
                else if (h.type === 'boolean' && h.value !== 'true' && h.value !== 'false') { h.value = 'true'; }
                else if (h.type === 'unix' && !h.value) { h.value = Math.floor(Date.now() / 1000); }
                else if (h.type === 'date' && !h.value) { h.value = new Date().toISOString().split('T')[0]; }
                else if (h.type === 'datetime' && !h.value) { h.value = new Date().toISOString().slice(0, 16); }
              `}
            >
              <option value="text">text</option>
              <option value="uuid">uuid</option>
              <option value="boolean">bool</option>
              <option value="date">date</option>
              <option value="datetime">datetime</option>
              <option value="unix">unix</option>
            </select>
          </template>
          <div class="row-sep"></div>

          {/* Value control by type */}
          <template x-if="!h.type || h.type === 'text'">
            <input
              type="text"
              class="input-bare"
              placeholder="Value (string or JSON)"
              x-model="h.value"
            />
          </template>

          <template x-if="h.type === 'uuid'">
            <div class="jose-control-with-action">
              <input
                type="text"
                class="input-bare"
                placeholder="UUID (e.g. 9b1deb4d-...)"
                x-model="h.value"
              />
              <button
                type="button"
                class="btn-control-action"
                title="Generate fresh UUIDv4"
                x-on:click="h.value = crypto.randomUUID()"
              >
                <span>Gen</span>
              </button>
            </div>
          </template>

          <template x-if="h.type === 'boolean'">
            <select class="jose-bool-select" x-model="h.value">
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </template>

          <template x-if="h.type === 'date'">
            <div class="jose-control-with-action">
              <input
                type="date"
                class="input-bare"
                x-bind:disabled="h.autoNow"
                x-model="h.value"
              />
              <label class="jose-now-toggle" title="Always use current request date at send time">
                <input
                  type="checkbox"
                  x-model="h.autoNow"
                  x-on:change="if (h.autoNow) h.value = new Date().toISOString().split('T')[0]"
                />
                <span>Now</span>
              </label>
            </div>
          </template>

          <template x-if="h.type === 'datetime'">
            <div class="jose-control-with-action">
              <input
                type="datetime-local"
                class="input-bare"
                x-bind:disabled="h.autoNow"
                x-model="h.value"
              />
              <label class="jose-now-toggle" title="Always use current request datetime at send time">
                <input
                  type="checkbox"
                  x-model="h.autoNow"
                  x-on:change="if (h.autoNow) h.value = new Date().toISOString().slice(0, 16)"
                />
                <span>Now</span>
              </label>
            </div>
          </template>

          <template x-if="h.type === 'unix'">
            <div class="jose-control-with-action">
              <input
                type="text"
                class="input-bare"
                placeholder="Epoch seconds (e.g. 1725546000)"
                x-bind:disabled="h.autoNow"
                x-model="h.value"
              />
              <label class="jose-now-toggle" title="Always evaluate current Unix timestamp at send time">
                <input
                  type="checkbox"
                  x-model="h.autoNow"
                  x-on:change="if (h.autoNow) h.value = Math.floor(Date.now() / 1000)"
                />
                <span>Now</span>
              </label>
            </div>
          </template>

          <button
            type="button"
            x-bind:class="h.isCrit ? 'btn-crit-toggle active' : 'btn-crit-toggle inactive'"
            x-on:click="if (!(h.fromSpec && (h.required || h.isCrit))) h.isCrit = !h.isCrit"
            x-bind:disabled="h.fromSpec && (h.required || h.isCrit)"
            title="Toggle RFC Critical parameter (crit)"
          >
            <span x-text="h.isCrit ? 'CRIT' : 'crit'"></span>
          </button>
          <template x-if="!h.required && !h.isCrit">
            <button
              type="button"
              class="btn btn-ghost btn-xs text-subtle"
              x-on:click={`${headersVar}.splice(idx, 1)`}
              title="Remove parameter"
            >
              <IconClose width={12} height={12} />
            </button>
          </template>
        </div>
      </template>
    </div>
  )
}

interface JosePayloadClaimsBuilderProps {
  title: string
  subtitle: string
  claimsVar: string
  placeholderKey: string
  emptyText: string
}

function JosePayloadClaimsBuilder({
  title,
  subtitle,
  claimsVar,
  placeholderKey,
  emptyText
}: JosePayloadClaimsBuilderProps) {
  return (
    <div class="jose-headers-section">
      <div class="kv-builder-header">
        <div class="jose-header-label-wrap">
          <span class="form-label">{title}</span>
          <span class="text-subtle jose-headers-subtitle">{subtitle}</span>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-xs"
          x-on:click={`${claimsVar}.push({ key: '', value: '', type: 'text', autoNow: false, enabled: true, fromSpec: false, required: false })`}
        >
          + Add Claim
        </button>
      </div>

      <template x-if={`${claimsVar}.length === 0`}>
        <div class="jose-headers-empty">
          {emptyText}
        </div>
      </template>

      <template x-for={`(c, idx) in ${claimsVar}`} x-bind:key="idx">
        <div class="jose-claim-row">
          <input
            type="checkbox"
            class="checkbox"
            x-model="c.enabled"
            x-bind:disabled="c.required"
            title="Enable / Disable payload claim"
          />
          <input
            type="text"
            x-bind:class="c.fromSpec ? 'input-bare input-bare-readonly' : 'input-bare'"
            placeholder={placeholderKey}
            x-model="c.key"
            x-bind:readonly="c.fromSpec"
          />
          <template x-if="c.fromSpec">
            <span class="jose-type-badge" x-text="c.type === 'boolean' ? 'bool' : c.type"></span>
          </template>
          <template x-if="!c.fromSpec">
            <select
              class="jose-type-select"
              x-model="c.type"
              x-on:change={`
                if (c.type === 'uuid' && (!c.value || !c.value.includes('-'))) { c.value = crypto.randomUUID(); }
                else if (c.type === 'boolean' && c.value !== 'true' && c.value !== 'false') { c.value = 'true'; }
                else if (c.type === 'unix' && !c.value) { c.value = Math.floor(Date.now() / 1000); }
                else if (c.type === 'date' && !c.value) { c.value = new Date().toISOString().split('T')[0]; }
                else if (c.type === 'datetime' && !c.value) { c.value = new Date().toISOString().slice(0, 16); }
              `}
            >
              <option value="text">text</option>
              <option value="uuid">uuid</option>
              <option value="boolean">bool</option>
              <option value="date">date</option>
              <option value="datetime">datetime</option>
              <option value="unix">unix</option>
            </select>
          </template>
          <div class="row-sep"></div>

          {/* Value control by type */}
          <template x-if="!c.type || c.type === 'text'">
            <input
              type="text"
              class="input-bare"
              placeholder="Value (string or JSON)"
              x-model="c.value"
            />
          </template>

          <template x-if="c.type === 'uuid'">
            <div class="jose-control-with-action">
              <input
                type="text"
                class="input-bare"
                placeholder="UUID (e.g. 9b1deb4d-...)"
                x-model="c.value"
              />
              <button
                type="button"
                class="btn-control-action"
                title="Generate fresh UUIDv4"
                x-on:click="c.value = crypto.randomUUID()"
              >
                <span>Gen</span>
              </button>
            </div>
          </template>

          <template x-if="c.type === 'boolean'">
            <select class="jose-bool-select" x-model="c.value">
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </template>

          <template x-if="c.type === 'date'">
            <div class="jose-control-with-action">
              <input
                type="date"
                class="input-bare"
                x-bind:disabled="c.autoNow"
                x-model="c.value"
              />
              <label class="jose-now-toggle" title="Always use current request date at send time">
                <input
                  type="checkbox"
                  x-model="c.autoNow"
                  x-on:change="if (c.autoNow) c.value = new Date().toISOString().split('T')[0]"
                />
                <span>Now</span>
              </label>
            </div>
          </template>

          <template x-if="c.type === 'datetime'">
            <div class="jose-control-with-action">
              <input
                type="datetime-local"
                class="input-bare"
                x-bind:disabled="c.autoNow"
                x-model="c.value"
              />
              <label class="jose-now-toggle" title="Always use current request datetime at send time">
                <input
                  type="checkbox"
                  x-model="c.autoNow"
                  x-on:change="if (c.autoNow) c.value = new Date().toISOString().slice(0, 16)"
                />
                <span>Now</span>
              </label>
            </div>
          </template>

          <template x-if="c.type === 'unix'">
            <div class="jose-control-with-action">
              <input
                type="text"
                class="input-bare"
                placeholder="Epoch seconds (e.g. 1725546000)"
                x-bind:disabled="c.autoNow"
                x-model="c.value"
              />
              <label class="jose-now-toggle" title="Always evaluate current Unix timestamp at send time">
                <input
                  type="checkbox"
                  x-model="c.autoNow"
                  x-on:change="if (c.autoNow) c.value = Math.floor(Date.now() / 1000)"
                />
                <span>Now</span>
              </label>
            </div>
          </template>

          <template x-if="!c.required">
            <button
              type="button"
              class="btn btn-ghost btn-xs text-subtle"
              x-on:click={`${claimsVar}.splice(idx, 1)`}
              title="Remove claim"
            >
              <IconClose width={12} height={12} />
            </button>
          </template>
        </div>
      </template>
    </div>
  )
}

export const RequestPanel = ({ spec, endpoint }: RequestPanelProps) => {
  const availableServers: ServerItem[] = [
    ...(endpoint.servers || []),
    ...(spec.servers || [])
  ]

  const defaultBaseUrl = availableServers[0]?.url || 'http://localhost:3000'
  const pathParams = (endpoint.parameters || []).filter((p) => p.in === 'path')

  const defaultQueryParams = (endpoint.parameters || [])
    .filter((p) => p.in === 'query')
    .map((p) => ({
      key: p.name,
      value: String(p.example || p.schema?.default || ''),
      enabled: true,
      required: Boolean(p.required),
      fromSpec: true
    }))

  const joseConfig = endpoint.joseSecurity
  const defaultKid = joseConfig?.sign?.kid || joseConfig?.encrypt?.kid || ''

  const defaultSignKey = joseConfig?.sign?.defaultKey || joseConfig?.defaultSigningKey || joseConfig?.defaultKey || ''
  const defaultSignPassphrase = joseConfig?.sign?.defaultPassphrase || ''
  const defaultEncKey = joseConfig?.encrypt?.defaultKey || joseConfig?.defaultEncryptionKey || (joseConfig?.mode === 'jwe' ? joseConfig?.defaultKey : '') || ''
  const defaultSingleKey = (joseConfig?.mode === 'jws' ? defaultSignKey : defaultEncKey) || joseConfig?.defaultKey || ''

  const sigDesc = joseConfig?.sign ? describeSignatureAlgorithm(joseConfig.sign.alg) : null
  const encDesc = joseConfig?.encrypt ? describeEncryptionAlgorithm(joseConfig.encrypt.alg) : null
  const cipherDesc = joseConfig?.encrypt ? describeContentCipher(joseConfig.encrypt.enc) : null

  let requiredJoseHeaderName: string | undefined
  if (joseConfig && joseConfig.enabled !== false) {
    if (joseConfig.sign && joseConfig.sign.placement !== 'body') {
      requiredJoseHeaderName = joseConfig.sign.headerName || 'X-Signature'
    } else if (joseConfig.encrypt && joseConfig.encrypt.placement === 'header') {
      requiredJoseHeaderName = joseConfig.encrypt.headerName || 'X-Encrypted-Payload'
    }
  }

  const defaultHeaders = (endpoint.parameters || [])
    .filter((p) => p.in === 'header' && p.name.toLowerCase() !== (requiredJoseHeaderName || '').toLowerCase())
    .map((p) => ({
      key: p.name,
      value: String(p.example || p.schema?.default || ''),
      enabled: true,
      required: Boolean(p.required),
      fromSpec: true
    }))

  const explicitRequiredHeaders = (endpoint.parameters || []).filter(
    (p) => p.in === 'header' && p.required && p.name.toLowerCase() !== (requiredJoseHeaderName || '').toLowerCase()
  )

  const isPayloadMethod = ['post', 'put', 'patch'].includes(endpoint.method.toLowerCase())
  const declaredContentTypes = endpoint.requestBody?.content ? Object.keys(endpoint.requestBody.content) : []
  const availableContentTypes = declaredContentTypes.length > 0
    ? declaredContentTypes
    : (isPayloadMethod ? ['application/json'] : [])
  const defaultContentType = availableContentTypes[0] || 'application/json'

  const sampleBodiesMap: Record<string, string> = {}
  for (const ct of availableContentTypes) {
    sampleBodiesMap[ct] = getSampleBodyForContentType(endpoint, ct, spec)
  }
  const defaultSampleBody = sampleBodiesMap[defaultContentType] || ''

  const isFormSupported = (ct: string): boolean => {
    if (!ct) return false
    const l = ct.toLowerCase()
    return l.includes('json') || l.includes('form-urlencoded') || l.includes('multipart')
  }

  const defaultBodyFields = extractInitialBodyFields(
    endpoint,
    defaultContentType,
    spec,
    defaultSampleBody
  )

  const defaultIsJson = defaultContentType.toLowerCase().includes('json')
  const initialBodyMode = defaultIsJson ? 'raw' : (isFormSupported(defaultContentType) ? 'form' : 'raw')

  const securityInfo = resolveEndpointSecurity(endpoint, spec)
  const primaryScheme = securityInfo.primaryScheme
  const defaultAuthType = primaryScheme ? primaryScheme.type : 'none'

  const hasParams = pathParams.length > 0 || defaultQueryParams.length > 0
  const hasRequestBody = isPayloadMethod && (availableContentTypes.length > 0 || Boolean(defaultSampleBody && defaultSampleBody.trim() !== ''))
  const hasDeclaredHeaders = defaultHeaders.length > 0 || explicitRequiredHeaders.length > 0 || Boolean(requiredJoseHeaderName)
  const hasAuth = securityInfo.isSecured
  const hasJose = Boolean(joseConfig)

  const availableTabs: Array<{ id: string; label: string; count?: number; icon?: string }> = []
  if (hasParams) {
    availableTabs.push({ id: 'params', label: 'Params', count: pathParams.length + defaultQueryParams.length })
  }
  if (hasRequestBody) {
    availableTabs.push({ id: 'body', label: 'Body' })
  }
  if (hasAuth) {
    availableTabs.push({ id: 'auth', label: 'Auth', icon: 'lock' })
  }
  if (hasDeclaredHeaders) {
    availableTabs.push({ id: 'headers', label: 'Headers', count: defaultHeaders.length + (requiredJoseHeaderName ? 1 : 0) + explicitRequiredHeaders.length })
  }
  if (hasJose) {
    availableTabs.push({ id: 'jose', label: 'JOSE Security', icon: 'lock' })
  }

  const initialTab = availableTabs[0]?.id || 'none'
  const defaultSignKid = joseConfig?.sign?.kid || ''
  const defaultEncKid = joseConfig?.encrypt?.kid || ''

  // JWS protected headers initialization
  const defaultJoseSignHeaders: Array<{ key: string; value: string; type: JoseValueType; autoNow: boolean; isCrit: boolean; enabled: boolean; fromSpec: boolean; required: boolean }> = []
  const signCritSet = new Set<string>(joseConfig?.sign?.crit || [])

  if (joseConfig?.sign?.b64 !== undefined) {
    const isCrit = signCritSet.has('b64')
    defaultJoseSignHeaders.push({
      key: 'b64',
      value: String(joseConfig.sign.b64),
      type: 'boolean',
      autoNow: false,
      isCrit,
      enabled: true,
      fromSpec: true,
      required: isCrit
    })
  }

  if (joseConfig?.sign?.customHeaders) {
    for (const [k, v] of Object.entries(joseConfig.sign.customHeaders)) {
      if (k === 'b64') continue
      const parsed = parseTypedEntry(k, v)
      const isCrit = signCritSet.has(k)
      defaultJoseSignHeaders.push({
        ...parsed,
        isCrit,
        enabled: true,
        fromSpec: true,
        required: isCrit || parsed.required
      })
    }
  }

  for (const critKey of signCritSet) {
    if (!defaultJoseSignHeaders.some((h) => h.key === critKey)) {
      defaultJoseSignHeaders.push({
        key: critKey,
        value: 'true',
        type: 'boolean',
        autoNow: false,
        isCrit: true,
        enabled: true,
        fromSpec: true,
        required: true
      })
    }
  }

  // JWS payload claims initialization
  const defaultJoseClaims: Array<{ key: string; value: string; type: JoseValueType; autoNow: boolean; enabled: boolean; fromSpec: boolean; required: boolean }> = []
  const initialSignClaims: Record<string, unknown> = {
    ...(joseConfig?.claims || {}),
    ...(joseConfig?.sign?.claims || {})
  }
  if (Object.keys(initialSignClaims).length > 0) {
    for (const [k, v] of Object.entries(initialSignClaims)) {
      const parsed = parseTypedEntry(k, v)
      defaultJoseClaims.push({
        ...parsed,
        enabled: true,
        fromSpec: true,
        required: parsed.required
      })
    }
  }

  // JWE protected headers initialization
  const defaultJoseEncHeaders: Array<{ key: string; value: string; type: JoseValueType; autoNow: boolean; isCrit: boolean; enabled: boolean; fromSpec: boolean; required: boolean }> = []
  const encCritSet = new Set<string>(joseConfig?.encrypt?.crit || [])

  if (joseConfig?.encrypt?.cty !== undefined) {
    const isCrit = encCritSet.has('cty')
    defaultJoseEncHeaders.push({
      key: 'cty',
      value: String(joseConfig.encrypt.cty),
      type: 'text',
      autoNow: false,
      isCrit,
      enabled: true,
      fromSpec: true,
      required: isCrit
    })
  }

  if (joseConfig?.encrypt?.zip !== undefined) {
    const isCrit = encCritSet.has('zip')
    defaultJoseEncHeaders.push({
      key: 'zip',
      value: String(joseConfig.encrypt.zip),
      type: 'text',
      autoNow: false,
      isCrit,
      enabled: true,
      fromSpec: true,
      required: isCrit
    })
  }

  if (joseConfig?.encrypt?.customHeaders) {
    for (const [k, v] of Object.entries(joseConfig.encrypt.customHeaders)) {
      if (k === 'cty' || k === 'zip') continue
      const parsed = parseTypedEntry(k, v)
      const isCrit = encCritSet.has(k)
      defaultJoseEncHeaders.push({
        ...parsed,
        isCrit,
        enabled: true,
        fromSpec: true,
        required: isCrit || parsed.required
      })
    }
  }

  for (const critKey of encCritSet) {
    if (!defaultJoseEncHeaders.some((h) => h.key === critKey)) {
      defaultJoseEncHeaders.push({
        key: critKey,
        value: 'true',
        type: 'boolean',
        autoNow: false,
        isCrit: true,
        enabled: true,
        fromSpec: true,
        required: true
      })
    }
  }

  const defaultJoseHeaders = [...defaultJoseSignHeaders, ...defaultJoseEncHeaders]

  // JWE payload claims initialization
  const defaultJoseEncClaims: Array<{ key: string; value: string; type: JoseValueType; autoNow: boolean; enabled: boolean; fromSpec: boolean; required: boolean }> = []
  if (joseConfig?.encrypt?.claims) {
    for (const [k, v] of Object.entries(joseConfig.encrypt.claims)) {
      const parsed = parseTypedEntry(k, v)
      defaultJoseEncClaims.push({
        ...parsed,
        enabled: true,
        fromSpec: true,
        required: parsed.required
      })
    }
  }

  const baseAlpineState = {
    activeTab: initialTab,
    baseUrl: defaultBaseUrl,
    pathParams: Object.fromEntries(pathParams.map((p) => [p.name, String(p.example || '1')])),
    queryParams: defaultQueryParams,
    headers: defaultHeaders,
    selectedContentType: defaultContentType,
    sampleBodies: sampleBodiesMap,
    body: defaultSampleBody,
    initialBody: defaultSampleBody,
    bodyMode: initialBodyMode,
    bodyFields: defaultBodyFields,
    joseSignHeaders: defaultJoseSignHeaders,
    joseEncHeaders: defaultJoseEncHeaders,
    joseHeaders: defaultJoseHeaders,
    joseClaims: defaultJoseClaims,
    joseEncClaims: defaultJoseEncClaims,
    joseSecurityJson: joseConfig ? JSON.stringify(joseConfig) : '',
    expectedSignFamily: sigDesc?.family || 'other',
    expectedEncFamily: encDesc?.family || 'other',
    defaultKeyText: defaultSingleKey,
    defaultSignKeyText: defaultSignKey,
    defaultEncKeyText: defaultEncKey,
    joseKeyContent: defaultSingleKey,
    joseKeyName: defaultSingleKey ? 'Default Spec Key' : '',
    joseKid: defaultKid,
    josePassphrase: defaultSignPassphrase,
    joseKeyStatus: defaultSingleKey ? 'Default key loaded (from spec)' : 'No key loaded',
    joseKeyInspector: null,
    joseKeyCompat: { valid: true, msg: defaultSingleKey ? 'Default key from specification' : 'No key loaded' },
    joseSigningKeyContent: defaultSignKey,
    joseSigningKeyName: defaultSignKey ? 'Default Spec Signing Key' : '',
    joseSigningKid: defaultSignKid,
    joseSigningPassphrase: defaultSignPassphrase,
    joseSigningKeyStatus: defaultSignKey ? 'Default signing key loaded' : 'No signing key loaded',
    joseSigningKeyInspector: null,
    joseSigningKeyCompat: { valid: true, msg: defaultSignKey ? 'Default signing key from specification' : 'No signing key loaded' },
    joseEncryptionKeyContent: defaultEncKey,
    joseEncryptionKeyName: defaultEncKey ? 'Default Spec Encryption Key' : '',
    joseEncryptionKid: defaultEncKid,
    joseEncryptionKeyStatus: defaultEncKey ? 'Default encryption key loaded' : 'No encryption key loaded',
    joseEncryptionKeyInspector: null,
    joseEncryptionKeyCompat: { valid: true, msg: defaultEncKey ? 'Default encryption key from specification' : 'No encryption key loaded' },
    specId: spec.id,
    endpointSchemes: securityInfo.schemes,
    auth: {
      type: defaultAuthType,
      schemeName: primaryScheme?.name || '',
      token: '',
      bearerPrefix: 'Bearer',
      apiKeyName: primaryScheme?.keyName || 'X-API-KEY',
      apiKeyValue: '',
      apiKeyPlacement: primaryScheme?.placement || 'header',
      username: '',
      password: '',
      disabled: false
    },
    authDeclaredScopes: primaryScheme?.scopes || [],
    authSchemeDescription: primaryScheme?.description || '',
    showAuthSecret: false,
    jwtClaims: null,
    showJwtDetails: false,
    hasGlobalAuth: false,
    showCustomInputs: false
  }

  return (
    <div
      class="request-runner"
      x-data={`{
        ...${JSON.stringify(baseAlpineState)},

        init() {
          this.checkGlobalAuth();
          window.addEventListener('spec-auth-updated', () => {
            this.checkGlobalAuth();
          });
          window.addEventListener('focus-auth-tab', (e) => {
            if (!e.detail || !e.detail.endpointId || e.detail.endpointId === '${endpoint.id}') {
              if (${hasAuth}) {
                this.activeTab = 'auth';
              }
            }
          });
        },

        checkGlobalAuth() {
          if (!this.specId) return;
          const g = window.getSpecAuth ? window.getSpecAuth(this.specId) : null;
          this.hasGlobalAuth = Boolean(g && (g.bearerToken || g.apiKeyValue || g.basicUser));
          if (g && !this.auth.disabled) {
            this.applyGlobalAuth(g);
          }
        },

        applyGlobalAuth(g) {
          if ((this.auth.type === 'bearer' || this.auth.type === 'oauth2' || this.auth.type === 'openIdConnect') && g.bearerToken) {
            if (!this.auth.token) this.auth.token = g.bearerToken;
          }
          if (this.auth.type === 'apiKey' && g.apiKeyValue) {
            if (!this.auth.apiKeyValue) this.auth.apiKeyValue = g.apiKeyValue;
            if (g.apiKeyName && !this.auth.apiKeyName) this.auth.apiKeyName = g.apiKeyName;
            if (g.apiKeyPlacement && !this.auth.apiKeyPlacement) this.auth.apiKeyPlacement = g.apiKeyPlacement;
          }
          if (this.auth.type === 'basic' && (g.basicUser || g.basicPass)) {
            if (!this.auth.username) this.auth.username = g.basicUser || '';
            if (!this.auth.password) this.auth.password = g.basicPass || '';
          }
          this.updateJwtInspector();
        },

        selectEndpointScheme(schemeName) {
          const target = this.endpointSchemes.find(s => s.name === schemeName);
          if (target) {
            this.auth.schemeName = target.name;
            this.auth.type = target.type;
            if (target.keyName) this.auth.apiKeyName = target.keyName;
            if (target.placement) this.auth.apiKeyPlacement = target.placement;
            this.authDeclaredScopes = target.scopes || [];
            this.authSchemeDescription = target.description || '';
            this.checkGlobalAuth();
            this.updateJwtInspector();
          }
        },

        updateJwtInspector() {
          if (window.parseJwtClaims && this.auth.token) {
            this.jwtClaims = window.parseJwtClaims(this.auth.token);
          } else {
            this.jwtClaims = null;
          }
        },

        isAuthActive() {
          if (this.auth.disabled || this.auth.type === 'none') return false;
          if (this.auth.type === 'bearer' || this.auth.type === 'oauth2' || this.auth.type === 'openIdConnect') {
            return Boolean(this.auth.token);
          }
          if (this.auth.type === 'apiKey') {
            return Boolean(this.auth.apiKeyValue);
          }
          if (this.auth.type === 'basic') {
            return Boolean(this.auth.username || this.auth.password);
          }
          return false;
        },

        getEffectiveAuth() {
          if (this.auth.disabled || this.auth.type === 'none') {
            return { type: 'none' };
          }
          if (this.auth.type === 'bearer' || this.auth.type === 'oauth2' || this.auth.type === 'openIdConnect') {
            return {
              type: 'bearer',
              schemeName: this.auth.schemeName,
              token: this.auth.token,
              bearerPrefix: this.auth.bearerPrefix || 'Bearer'
            };
          }
          if (this.auth.type === 'apiKey') {
            return {
              type: 'apiKey',
              schemeName: this.auth.schemeName,
              apiKeyName: this.auth.apiKeyName,
              apiKeyValue: this.auth.apiKeyValue,
              apiKeyPlacement: this.auth.apiKeyPlacement || 'header'
            };
          }
          if (this.auth.type === 'basic') {
            return {
              type: 'basic',
              schemeName: this.auth.schemeName,
              username: this.auth.username,
              password: this.auth.password
            };
          }
          return { type: 'none' };
        },

        isFormSupported(ct) {
          if (!ct) return false;
          const l = (ct || '').toLowerCase();
          return l.includes('json') || l.includes('form-urlencoded') || l.includes('multipart');
        },

        syncBodyFromFields() {
          const ct = (this.selectedContentType || '').toLowerCase();
          if (ct.includes('json')) {
            const obj = {};
            for (const f of this.bodyFields) {
              if (!f.enabled || !f.key || !f.key.trim()) continue;
              const k = f.key.trim();
              let v = f.value;
              if (f.type === 'number' && v !== '' && !isNaN(Number(v))) {
                obj[k] = Number(v);
              } else if (f.type === 'boolean' || v === 'true' || v === 'false') {
                obj[k] = v === 'true' || v === true;
              } else if (typeof v === 'string' && ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']')))) {
                try { obj[k] = JSON.parse(v); } catch (e) { obj[k] = v; }
              } else {
                obj[k] = v;
              }
            }
            this.body = JSON.stringify(obj, null, 2);
          } else if (ct.includes('form-urlencoded')) {
            const params = new URLSearchParams();
            for (const f of this.bodyFields) {
              if (!f.enabled || !f.key || !f.key.trim()) continue;
              params.append(f.key.trim(), f.value !== undefined && f.value !== null ? f.value : '');
            }
            this.body = params.toString();
          } else if (ct.includes('multipart')) {
            const lines = [];
            for (const f of this.bodyFields) {
              if (!f.enabled || !f.key || !f.key.trim()) continue;
              lines.push(f.key.trim() + '=' + (f.value !== undefined ? f.value : ''));
            }
            this.body = lines.join('\\n');
          }
        },

        syncFieldsFromBody() {
          const ct = (this.selectedContentType || '').toLowerCase();
          const trimmed = (this.body || '').trim();
          if (!trimmed) {
            this.bodyFields = [];
            return true;
          }
          if (ct.includes('json')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const newFields = [];
                for (const [k, v] of Object.entries(parsed)) {
                  const existing = this.bodyFields.find(f => f.key === k);
                  newFields.push({
                    key: k,
                    value: typeof v === 'object' ? JSON.stringify(v) : String(v !== undefined && v !== null ? v : ''),
                    type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : (existing ? existing.type : 'string'),
                    enabled: true,
                    required: existing ? existing.required : false,
                    fromSpec: existing ? existing.fromSpec : false,
                    description: existing ? existing.description : undefined
                  });
                }
                this.bodyFields = newFields;
                return true;
              }
            } catch (e) {
              return false;
            }
          } else if (ct.includes('form-urlencoded')) {
            try {
              const params = new URLSearchParams(trimmed);
              const newFields = [];
              params.forEach((v, k) => {
                const existing = this.bodyFields.find(f => f.key === k);
                newFields.push({
                  key: k,
                  value: v,
                  type: 'string',
                  enabled: true,
                  required: existing ? existing.required : false,
                  fromSpec: existing ? existing.fromSpec : false
                });
              });
              if (newFields.length > 0) {
                this.bodyFields = newFields;
                return true;
              }
            } catch (e) {
              return false;
            }
          }
          return true;
        },

        switchToFormMode() {
          const ok = this.syncFieldsFromBody();
          if (!ok) {
            alert('Cannot switch to Form view: Body contains invalid JSON. Please correct the syntax first.');
            return;
          }
          this.bodyMode = 'form';
        },

        switchToRawMode() {
          this.syncBodyFromFields();
          this.bodyMode = 'raw';
        },

        resetBody() {
          this.body = (this.sampleBodies && this.sampleBodies[this.selectedContentType] !== undefined ? this.sampleBodies[this.selectedContentType] : this.initialBody);
          this.syncFieldsFromBody();
        },

        changeContentType(newType) {
          this.selectedContentType = newType;
          const l = (newType || '').toLowerCase();
          if (!this.isFormSupported(newType) || l.includes('json')) {
            this.bodyMode = 'raw';
          } else {
            this.bodyMode = 'form';
          }
          if (this.sampleBodies && this.sampleBodies[newType] !== undefined) {
            this.body = this.sampleBodies[newType];
            this.initialBody = this.body;
            this.syncFieldsFromBody();
          } else {
            this.syncBodyFromFields();
          }
        }
      }`}
    >
      {joseConfig && (
        <JoseSecurityBar joseSecurity={joseConfig} />
      )}

      <div class="request-panel">

        {/* 1. Panel Header */}
        <div class="request-panel-header">
        <div class="header-brand">
          <IconPlay width={13} height={13} class="panel-icon text-muted" />
          <span class="playground-title">API Playground</span>
        </div>
        <div class="header-actions">
          <span class="badge badge-subtle">Proxied via Portal</span>
        </div>
      </div>

      {/* 2. Interactive Form */}
      <form
        hx-post="/api/proxy"
        hx-target="#response-panel-container"
        hx-swap="innerHTML"
        hx-indicator="#send-request-btn"
        hx-disabled-elt="#send-request-btn"
        x-on:submit="
          const nowSec = Math.floor(Date.now() / 1000);
          const nowIso = new Date().toISOString();
          const nowDate = nowIso.split('T')[0];
          const updateAutoNow = (arr) => {
            if (!Array.isArray(arr)) return;
            arr.forEach(item => {
              if (item && item.autoNow) {
                if (item.type === 'unix') item.value = String(nowSec);
                else if (item.type === 'datetime') item.value = nowIso;
                else if (item.type === 'date') item.value = nowDate;
              }
            });
          };
          updateAutoNow(joseClaims);
          updateAutoNow(joseEncClaims);
          updateAutoNow(joseSignHeaders);
          updateAutoNow(joseEncHeaders);
          if (bodyMode === 'form') { syncBodyFromFields(); }
        "
      >
        <input type="hidden" name="pathTemplate" value={endpoint.path} />
        <input type="hidden" name="method" value={endpoint.method} />
        <input type="hidden" name="baseUrl" x-bind:value="baseUrl" />
        <input type="hidden" name="pathParamsJson" x-bind:value="JSON.stringify(pathParams)" />
        <input type="hidden" name="queryParamsJson" x-bind:value="JSON.stringify(queryParams.filter(q => q.enabled && q.key.trim()))" />
        <input type="hidden" name="headersJson" x-bind:value="JSON.stringify(headers.filter(h => h.enabled && h.key.trim()))" />
        <input type="hidden" name="authJson" x-bind:value="JSON.stringify(getEffectiveAuth())" />
        <input type="hidden" name="contentType" x-bind:value="selectedContentType" />
        <input type="hidden" name="body" x-bind:value="body" />
        {joseConfig && (
          <>
            <input type="hidden" name="joseSecurityJson" x-bind:value="joseSecurityJson" />
            <input type="hidden" name="joseSignHeadersJson" x-bind:value="JSON.stringify(joseSignHeaders)" />
            <input type="hidden" name="joseEncHeadersJson" x-bind:value="JSON.stringify(joseEncHeaders)" />
            <input type="hidden" name="joseHeadersJson" x-bind:value="JSON.stringify(joseHeaders)" />
            <input type="hidden" name="joseClaimsJson" x-bind:value="JSON.stringify(joseClaims)" />
            <input type="hidden" name="joseEncClaimsJson" x-bind:value="JSON.stringify(joseEncClaims)" />
            <input type="hidden" name="joseKeyContent" x-bind:value="joseKeyContent" />
            <input type="hidden" name="joseKid" x-bind:value="joseKid" />
            <input type="hidden" name="josePassphrase" x-bind:value="josePassphrase" />
            <input type="hidden" name="joseSigningKeyContent" x-bind:value="joseSigningKeyContent" />
            <input type="hidden" name="joseSigningKid" x-bind:value="joseSigningKid" />
            <input type="hidden" name="joseSigningPassphrase" x-bind:value="joseSigningPassphrase" />
            <input type="hidden" name="joseEncryptionKeyContent" x-bind:value="joseEncryptionKeyContent" />
            <input type="hidden" name="joseEncryptionKid" x-bind:value="joseEncryptionKid" />
          </>
        )}

        {/* Dedicated Target Server Strip */}
        <div class="request-server-bar">
          <label class="form-label">Target Server</label>
          <div class="url-bar">
            {availableServers.length > 0 ? (
              <select class="select" x-model="baseUrl">
                {availableServers.map((srv) => (
                  <option value={srv.url}>
                    {srv.url}{srv.description ? ` — ${srv.description}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                class="input"
                x-model="baseUrl"
                placeholder="http://localhost:3000"
              />
            )}
            <button id="send-request-btn" type="submit" class="btn btn-primary">
              <span class="htmx-indicator btn-spinner" aria-hidden="true"></span>
              <span class="btn-label-idle"><IconPlay width={13} height={13} /> Send Request</span>
              <span class="htmx-indicator btn-label-loading">Sending…</span>
            </button>
          </div>
        </div>

        {availableTabs.length > 0 ? (
          <>
            {/* Edge-to-Edge Tabs Bar */}
            <div class="tab-bar">
              {availableTabs.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  x-on:click={`activeTab = '${t.id}'`}
                  x-bind:class={`activeTab === '${t.id}' ? 'tab-button active' : 'tab-button'`}
                >
                  {t.icon === 'lock' && <IconLock width={12} height={12} />}
                  <span>{t.label}</span>
                  {t.count !== undefined && t.count > 0 && <span class="tab-count-pill">({t.count})</span>}
                  {t.id === 'auth' && <span class="tab-auth-indicator" x-show="isAuthActive()" x-cloak></span>}
                </button>
              ))}

              {(!hasDeclaredHeaders || !hasParams) && (
                <button
                  type="button"
                  class="tab-button tab-button-options"
                  x-on:click="showCustomInputs = !showCustomInputs"
                  x-bind:class="showCustomInputs ? 'active' : ''"
                  title="Toggle optional custom query parameters and request headers overrides"
                >
                  <span x-text="showCustomInputs ? '− Options' : '+ Options'"></span>
                </button>
              )}
            </div>

            {/* Unified Tab Content Area with consistent padding */}
            <div class="request-tab-content">

              {/* TAB 0: AUTH (Only if declared in spec) */}
              {hasAuth && (
                <div x-show="activeTab === 'auth'" class="form-group" x-cloak>
                  <AuthPanel spec={spec} endpoint={endpoint} securityInfo={securityInfo} />
                </div>
              )}

              {/* TAB 1: PARAMS (Path + Query) */}
              {hasParams && (
                <div x-show="activeTab === 'params'" class="form-group">
                  {/* Path Parameters */}
                  {pathParams.length > 0 && (
                    <div class="kv-section">
                      <div class="kv-builder-header">
                        <span class="form-label">Path Parameters</span>
                      </div>
                      <div class="path-params-rows">
                        {pathParams.map((p: ParameterItem) => (
                          <div key={p.name} class="path-param-row">
                            <span class="path-param-label">{p.name} *</span>
                            <input
                              type="text"
                              class="input"
                              x-model={`pathParams['${p.name}']`}
                              placeholder={p.description || p.name}
                              required
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Query Parameters (if declared in spec) */}
                  {defaultQueryParams.length > 0 && (
                    <div class="kv-section">
                      <div class="kv-builder-header">
                        <span class="form-label">Query Parameters</span>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          x-on:click="queryParams.push({ key: '', value: '', enabled: true, fromSpec: false, required: false })"
                        >
                          + Add Param
                        </button>
                      </div>

                      <div class="kv-builder-rows">
                        <template x-for="(q, idx) in queryParams" x-bind:key="idx">
                          <div class="kv-row">
                            <input
                              type="checkbox"
                              class="kv-checkbox"
                              x-model="q.enabled"
                              x-bind:disabled="q.required"
                            />
                            <input
                              type="text"
                              x-bind:class="q.fromSpec ? 'kv-input kv-input-readonly' : 'kv-input'"
                              placeholder="Key"
                              x-model="q.key"
                              x-bind:readonly="q.fromSpec"
                            />
                            <div class="kv-divider"></div>
                            <input type="text" class="kv-input" placeholder="Value" x-model="q.value" />
                            <template x-if="!q.required">
                              <button
                                type="button"
                                class="kv-remove-btn"
                                x-on:click="queryParams.splice(idx, 1)"
                                aria-label="Remove"
                              ><IconClose width={12} height={12} /></button>
                            </template>
                          </div>
                        </template>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: HEADERS */}
              {hasDeclaredHeaders && (
                <div x-show="activeTab === 'headers'" class="form-group">
                  {/* Required Headers Notices */}
                  {(requiredJoseHeaderName || explicitRequiredHeaders.length > 0) && (
                    <div class="required-headers-container">
                      {requiredJoseHeaderName && (
                        <div class="required-header-card">
                          <div class="required-header-info">
                            <span class="badge-required">Required</span>
                            <code class="required-header-name">{requiredJoseHeaderName}</code>
                          </div>
                          <span class="required-header-note">
                            <IconLock width={12} height={12} /> Auto-generated via JOSE {joseConfig?.mode?.toUpperCase()} ({joseConfig?.sign ? joseConfig.sign.alg : joseConfig?.encrypt?.alg}) on send
                          </span>
                        </div>
                      )}
                      {explicitRequiredHeaders.map((rh) => (
                        <div key={rh.name} class="required-header-card">
                          <div class="required-header-info">
                            <span class="badge-required">Required</span>
                            <code class="required-header-name">{rh.name}</code>
                          </div>
                          <span class="required-header-note">
                            {rh.description || 'Required by API specification'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Custom Headers Builder */}
                  <div class="kv-section">
                    <div class="kv-builder-header">
                      <span class="form-label">HTTP Headers</span>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        x-on:click="headers.push({ key: '', value: '', enabled: true, fromSpec: false, required: false })"
                      >
                        + Add Header
                      </button>
                    </div>

                    <div class="kv-builder-rows">
                      <template x-for="(h, idx) in headers" x-bind:key="idx">
                        <div class="kv-row">
                          <input
                            type="checkbox"
                            class="kv-checkbox"
                            x-model="h.enabled"
                            x-bind:disabled="h.required"
                          />
                          <input
                            type="text"
                            x-bind:class="h.fromSpec ? 'kv-input kv-input-readonly' : 'kv-input'"
                            placeholder="Header Name"
                            x-model="h.key"
                            x-bind:readonly="h.fromSpec"
                          />
                          <div class="kv-divider"></div>
                          <input type="text" class="kv-input" placeholder="Value" x-model="h.value" />
                          <template x-if="!h.required">
                            <button
                              type="button"
                              class="kv-remove-btn"
                              x-on:click="headers.splice(idx, 1)"
                              aria-label="Remove"
                            ><IconClose width={12} height={12} /></button>
                          </template>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: BODY */}
              {hasRequestBody && (
                <div x-show="activeTab === 'body'" class="form-field">
                  <div class="content-type-selector-bar">
                    <div class="content-type-label-group">
                      <span class="form-label">Request Body</span>
                      {availableContentTypes.length > 1 && availableContentTypes.length <= 3 ? (
                        <div class="content-type-pills">
                          {availableContentTypes.map((ct) => (
                            <button
                              type="button"
                              class="content-type-pill"
                              title={ct}
                              x-bind:class={`selectedContentType === '${ct}' ? 'active' : ''`}
                              x-on:click={`changeContentType('${ct}')`}
                            >
                              {formatContentTypeLabel(ct)}
                            </button>
                          ))}
                        </div>
                      ) : availableContentTypes.length > 3 ? (
                        <select
                          class="select content-type-select"
                          x-model="selectedContentType"
                          x-on:change="changeContentType($event.target.value)"
                        >
                          {availableContentTypes.map((ct) => (
                            <option value={ct}>{formatContentTypeLabel(ct)}</option>
                          ))}
                        </select>
                      ) : (
                        <span class="badge badge-subtle font-mono text-xs" title={defaultContentType}>
                          {formatContentTypeLabel(defaultContentType)}
                        </span>
                      )}
                    </div>

                    <div class="body-toolbar-actions">
                      {/* Form / Raw Mode Switcher (Visible for structured types) */}
                      <div
                        class="body-mode-switcher"
                        x-show="isFormSupported(selectedContentType)"
                      >
                        <button
                          type="button"
                          class="body-mode-tab"
                          x-bind:class="bodyMode === 'form' ? 'active' : ''"
                          x-on:click="switchToFormMode()"
                          title="Key-Value Form UI"
                        >
                          Form
                        </button>
                        <button
                          type="button"
                          class="body-mode-tab"
                          x-bind:class="bodyMode === 'raw' ? 'active' : ''"
                          x-on:click="switchToRawMode()"
                          title="Raw editor"
                        >
                          Raw
                        </button>
                      </div>

                      {/* Raw Mode Format Buttons */}
                      <div
                        class="btn-group-sm"
                        x-show="bodyMode === 'raw' || !isFormSupported(selectedContentType)"
                      >
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs"
                          x-show="selectedContentType.toLowerCase().includes('json')"
                          x-on:click="body = window.formatJsonString ? window.formatJsonString(body) : body"
                        >
                          Format JSON
                        </button>
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs"
                          x-show="selectedContentType.toLowerCase().includes('form-urlencoded')"
                          x-on:click="body = window.formatUrlEncodedString ? window.formatUrlEncodedString(body) : body"
                        >
                          Format Form
                        </button>
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs"
                          x-show="selectedContentType.toLowerCase().includes('xml')"
                          x-on:click="body = window.formatXmlString ? window.formatXmlString(body) : body"
                        >
                          Format XML
                        </button>
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs"
                          x-on:click="resetBody()"
                          title="Reset payload to default sample"
                        >
                          <IconRefresh width={11} height={11} /> Reset
                        </button>
                      </div>

                      {/* Form Mode Action Buttons */}
                      <div
                        class="btn-group-sm"
                        x-show="bodyMode === 'form' && isFormSupported(selectedContentType)"
                      >
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs"
                          x-on:click="bodyFields.push({ key: '', value: '', enabled: true, fromSpec: false, required: false, type: 'string' }); syncBodyFromFields()"
                        >
                          + Add Field
                        </button>
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs"
                          x-on:click="resetBody()"
                          title="Reset fields to spec defaults"
                        >
                          <IconRefresh width={11} height={11} /> Reset
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Form Mode: Key-Value Field Rows */}
                  <div
                    class="kv-section body-kv-section"
                    x-show="bodyMode === 'form' && isFormSupported(selectedContentType)"
                  >
                    <template x-if="bodyFields.length === 0">
                      <div class="empty-state-muted">
                        No fields defined. Click <strong>+ Add Field</strong> or switch to <strong>Raw</strong> mode to write JSON directly.
                      </div>
                    </template>

                    <div class="kv-builder-rows" x-show="bodyFields.length > 0">
                      <template x-for="(f, idx) in bodyFields" x-bind:key="idx">
                        <div class="kv-row">
                          <input
                            type="checkbox"
                            class="kv-checkbox"
                            x-model="f.enabled"
                            x-bind:disabled="f.required"
                            x-on:change="syncBodyFromFields()"
                            title="Include field in request"
                          />
                          <input
                            type="text"
                            x-bind:class="f.fromSpec ? 'kv-input kv-input-readonly' : 'kv-input'"
                            placeholder="Key"
                            x-model="f.key"
                            x-bind:readonly="f.fromSpec"
                            x-on:input="syncBodyFromFields()"
                          />
                          <div class="kv-divider"></div>
                          <input
                            type="text"
                            class="kv-input"
                            placeholder="Value"
                            x-model="f.value"
                            x-on:input="syncBodyFromFields()"
                          />
                          <template x-if="!f.required">
                            <button
                              type="button"
                              class="kv-remove-btn"
                              x-on:click="bodyFields.splice(idx, 1); syncBodyFromFields()"
                              aria-label="Remove"
                            >
                              <IconClose width={12} height={12} />
                            </button>
                          </template>
                        </div>
                      </template>
                    </div>
                  </div>

                  {/* Raw Mode: Monospace Textarea */}
                  <div x-show="bodyMode === 'raw' || !isFormSupported(selectedContentType)">
                    <textarea
                      class="textarea request-body-textarea"
                      rows={13}
                      x-model="body"
                      x-bind:placeholder="
                        selectedContentType.toLowerCase().includes('form-urlencoded')
                          ? 'grant_type=client_credentials&client_id=...'
                          : selectedContentType.toLowerCase().includes('xml')
                          ? '<root>\n  <key>value</key>\n</root>'
                          : selectedContentType.toLowerCase().includes('multipart')
                          ? '------Boundary\nContent-Disposition: form-data; name=&quot;field&quot;\n\nvalue\n------Boundary--'
                          : selectedContentType.toLowerCase().startsWith('text/')
                          ? 'Enter plain text content...'
                          : '{\n  &quot;key&quot;: &quot;value&quot;\n}'
                      "
                      spellcheck={false}
                    ></textarea>
                  </div>
                </div>
              )}

          {/* TAB 4: JOSE SECURITY (Key Configuration) */}
          {joseConfig && (
            <div x-show="activeTab === 'jose'" class="form-group">
              {joseConfig.mode === 'both' ? (
                /* Dual-Key Layout */
                <div class="jose-keys-grid">
                  {/* 1. Client Signing Key */}
                  <div class="jose-minimal-key-box">
                    <div class="jose-minimal-key-header">
                      <div class="jose-minimal-key-label">
                        <IconKey width={12} height={12} class="text-muted" />
                        <span>Sender Signing Key (Client Private)</span>
                      </div>
                      <div class="jose-minimal-key-specs">
                        <code class="jose-mono-tag">{sigDesc?.alg}</code>
                        <span class="text-muted">{sigDesc?.family}</span>
                      </div>
                    </div>

                    <div class="jose-minimal-upload-row">
                      <input
                        type="file"
                        id="jose-signing-file-input"
                        class="jose-file-hidden"
                        accept=".pem,.jwk,.key,.der,.json"
                        x-on:change="
                          const file = $event.target.files[0];
                          if (file) {
                            joseSigningKeyName = file.name;
                            const isDer = file.name.toLowerCase().endsWith('.der');
                            const reader = new FileReader();
                            if (isDer) {
                              reader.onload = (e) => {
                                const bytes = new Uint8Array(e.target.result);
                                let binary = '';
                                for (let i = 0; i < bytes.byteLength; i++) {
                                  binary += String.fromCharCode(bytes[i]);
                                }
                                joseSigningKeyContent = 'der:base64:' + btoa(binary);
                                joseSigningKeyStatus = file.name;
                                if (window.inspectJoseKey) {
                                  joseSigningKeyInspector = window.inspectJoseKey(joseSigningKeyContent, file.name);
                                  joseSigningKeyCompat = window.checkJoseKeyCompatibility(joseSigningKeyInspector.family, joseSigningKeyInspector.role, expectedSignFamily, 'private');
                                }
                              };
                              reader.readAsArrayBuffer(file);
                            } else {
                              reader.onload = (e) => {
                                joseSigningKeyContent = e.target.result;
                                joseSigningKeyStatus = file.name;
                                if (window.inspectJoseKey) {
                                  joseSigningKeyInspector = window.inspectJoseKey(joseSigningKeyContent, file.name);
                                  joseSigningKeyCompat = window.checkJoseKeyCompatibility(joseSigningKeyInspector.family, joseSigningKeyInspector.role, expectedSignFamily, 'private');
                                  if (joseSigningKeyInspector.kid && !joseSigningKid) {
                                    joseSigningKid = joseSigningKeyInspector.kid;
                                  }
                                }
                              };
                              reader.readAsText(file);
                            }
                          }
                        "
                      />
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        x-on:click="document.getElementById('jose-signing-file-input').click()"
                      >
                        <IconKey width={11} height={11} /> Upload Key
                      </button>

                      <template x-if="joseSigningKeyContent">
                        <div class="jose-minimal-upload-row">
                          <span class="jose-minimal-file-badge">
                            <span x-text="joseSigningKeyName"></span>
                            <span class="text-muted" x-text="joseSigningKeyInspector?.format ? `(${joseSigningKeyInspector.format})` : ''"></span>
                          </span>
                          <span x-bind:class="joseSigningKeyCompat?.valid ? 'jose-compat-mini-tag valid' : 'jose-compat-mini-tag invalid'">
                            <IconCheck width={10} height={10} /> <span x-text="joseSigningKeyCompat?.msg"></span>
                          </span>
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            x-on:click="joseSigningKeyContent = ''; joseSigningKeyName = ''; joseSigningKeyStatus = 'No signing key loaded'; joseSigningKeyInspector = null; document.getElementById('jose-signing-file-input').value = ''"
                            title="Clear key"
                          >
                            <IconClose width={11} height={11} />
                          </button>
                        </div>
                      </template>

                      <template x-if="!joseSigningKeyContent">
                        <div class="jose-no-key-row">
                          <span class="text-subtle">
                            Supports PEM, JWK, or DER
                          </span>
                          <template x-if="defaultSignKeyText">
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              x-on:click="joseSigningKeyContent = defaultSignKeyText; joseSigningKeyName = 'Default Spec Key'; joseSigningKeyStatus = 'Default signing key loaded'; joseSigningKeyCompat = { valid: true, msg: 'Default key from specification' }"
                            >
                              Use Default Key
                            </button>
                          </template>
                        </div>
                      </template>
                    </div>

                    <div class="jose-minimal-inputs">
                      <input
                        type="text"
                        class="input input-sm"
                        x-model="joseSigningKid"
                        placeholder={joseConfig.sign?.kid ? `kid: ${joseConfig.sign.kid}` : "Key ID (kid) - optional"}
                        autocomplete="off"
                      />
                      <input
                        type="password"
                        class="input input-sm"
                        x-model="joseSigningPassphrase"
                        placeholder="Passphrase (optional)"
                        autocomplete="new-password"
                      />
                    </div>

                    <div class="jose-box-divider"></div>
                    <JoseProtectedHeadersBuilder
                      title="JWS Protected Headers"
                      subtitle="(RFC 7515 Parameters)"
                      headersVar="joseSignHeaders"
                      placeholderKey="Header Name (e.g. x-tenant-id, typ, b64)"
                      emptyText='No custom JWS protected headers configured. Click "+ Add Header" to append parameters (e.g. x-tenant-id, typ, b64).'
                    />

                    <div class="jose-box-divider"></div>
                    <JosePayloadClaimsBuilder
                      title="JWS Payload Claims"
                      subtitle="(RFC 7519 Claims Set)"
                      claimsVar="joseClaims"
                      placeholderKey="Claim Name (e.g. iss, aud, sub, scope)"
                      emptyText='No custom JWS payload claims configured. Click "+ Add Claim" to append claims (e.g. iss, aud, sub, scope).'
                    />
                  </div>

                  {/* 2. Recipient Encryption Key */}
                  <div class="jose-minimal-key-box">
                    <div class="jose-minimal-key-header">
                      <div class="jose-minimal-key-label">
                        <IconLock width={12} height={12} class="text-muted" />
                        <span>Recipient Encryption Key (Server Public)</span>
                      </div>
                      <div class="jose-minimal-key-specs">
                        <code class="jose-mono-tag">{encDesc?.alg} / {cipherDesc?.enc}</code>
                        <span class="text-muted">{encDesc?.family}</span>
                      </div>
                    </div>

                    <div class="jose-minimal-upload-row">
                      <input
                        type="file"
                        id="jose-encryption-file-input"
                        class="jose-file-hidden"
                        accept=".pem,.jwk,.key,.der,.crt,.cer,.json"
                        x-on:change="
                          const file = $event.target.files[0];
                          if (file) {
                            joseEncryptionKeyName = file.name;
                            const isDer = file.name.toLowerCase().endsWith('.der') || file.name.toLowerCase().endsWith('.cer') || file.name.toLowerCase().endsWith('.crt');
                            const reader = new FileReader();
                            if (isDer) {
                              reader.onload = (e) => {
                                const bytes = new Uint8Array(e.target.result);
                                let binary = '';
                                for (let i = 0; i < bytes.byteLength; i++) {
                                  binary += String.fromCharCode(bytes[i]);
                                }
                                joseEncryptionKeyContent = 'der:base64:' + btoa(binary);
                                joseEncryptionKeyStatus = file.name;
                                if (window.inspectJoseKey) {
                                  joseEncryptionKeyInspector = window.inspectJoseKey(joseEncryptionKeyContent, file.name);
                                  joseEncryptionKeyCompat = window.checkJoseKeyCompatibility(joseEncryptionKeyInspector.family, joseEncryptionKeyInspector.role, expectedEncFamily, 'public');
                                }
                              };
                              reader.readAsArrayBuffer(file);
                            } else {
                              reader.onload = (e) => {
                                joseEncryptionKeyContent = e.target.result;
                                joseEncryptionKeyStatus = file.name;
                                if (window.inspectJoseKey) {
                                  joseEncryptionKeyInspector = window.inspectJoseKey(joseEncryptionKeyContent, file.name);
                                  joseEncryptionKeyCompat = window.checkJoseKeyCompatibility(joseEncryptionKeyInspector.family, joseEncryptionKeyInspector.role, expectedEncFamily, 'public');
                                  if (joseEncryptionKeyInspector.kid && !joseEncryptionKid) {
                                    joseEncryptionKid = joseEncryptionKeyInspector.kid;
                                  }
                                }
                              };
                              reader.readAsText(file);
                            }
                          }
                        "
                      />
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        x-on:click="document.getElementById('jose-encryption-file-input').click()"
                      >
                        <IconLock width={11} height={11} /> Upload Key / Cert
                      </button>

                      <template x-if="joseEncryptionKeyContent">
                        <div class="jose-minimal-upload-row">
                          <span class="jose-minimal-file-badge">
                            <span x-text="joseEncryptionKeyName"></span>
                            <span class="text-muted" x-text="joseEncryptionKeyInspector?.format ? `(${joseEncryptionKeyInspector.format})` : ''"></span>
                          </span>
                          <span x-bind:class="joseEncryptionKeyCompat?.valid ? 'jose-compat-mini-tag valid' : 'jose-compat-mini-tag invalid'">
                            <IconCheck width={10} height={10} /> <span x-text="joseEncryptionKeyCompat?.msg"></span>
                          </span>
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            x-on:click="joseEncryptionKeyContent = ''; joseEncryptionKeyName = ''; joseEncryptionKeyStatus = 'No encryption key loaded'; joseEncryptionKeyInspector = null; document.getElementById('jose-encryption-file-input').value = ''"
                            title="Clear key"
                          >
                            <IconClose width={11} height={11} />
                          </button>
                        </div>
                      </template>

                      <template x-if="!joseEncryptionKeyContent">
                        <div class="jose-no-key-row">
                          <span class="text-subtle">
                            Supports PEM, JWK, or DER
                          </span>
                          <template x-if="defaultEncKeyText">
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              x-on:click="joseEncryptionKeyContent = defaultEncKeyText; joseEncryptionKeyName = 'Default Spec Key'; joseEncryptionKeyStatus = 'Default encryption key loaded'; joseEncryptionKeyCompat = { valid: true, msg: 'Default key from specification' }"
                            >
                              Use Default Key
                            </button>
                          </template>
                        </div>
                      </template>
                    </div>

                    <div>
                      <input
                        type="text"
                        class="input input-sm"
                        x-model="joseEncryptionKid"
                        placeholder={joseConfig.encrypt?.kid ? `kid: ${joseConfig.encrypt.kid}` : "Key ID (kid) - optional"}
                        autocomplete="off"
                      />
                    </div>

                    <div class="jose-box-divider"></div>
                    <JoseProtectedHeadersBuilder
                      title="JWE Protected Headers"
                      subtitle="(RFC 7516 Parameters)"
                      headersVar="joseEncHeaders"
                      placeholderKey="Header Name (e.g. cty, zip, enc-purpose)"
                      emptyText='No custom JWE protected headers configured. Click "+ Add Header" to append parameters (e.g. cty, zip, enc-purpose).'
                    />

                    <div class="jose-box-divider"></div>
                    <JosePayloadClaimsBuilder
                      title="JWE Payload Claims"
                      subtitle="(RFC 7519 Encrypted Claims Set)"
                      claimsVar="joseEncClaims"
                      placeholderKey="Claim Name (e.g. sub, iss, tenantId, scope)"
                      emptyText='No custom JWE payload claims configured. Click "+ Add Claim" to append encrypted claims (e.g. sub, iss, tenantId, scope).'
                    />
                  </div>
                </div>
              ) : (
                /* Single Key Layout */
                <div class="jose-minimal-key-box">
                  <div class="jose-minimal-key-header">
                    <div class="jose-minimal-key-label">
                      {joseConfig.mode === 'jws' ? (
                        <>
                          <IconKey width={12} height={12} class="text-muted" />
                          <span>Sender Signing Key (Client Private)</span>
                        </>
                      ) : (
                        <>
                          <IconLock width={12} height={12} class="text-muted" />
                          <span>Recipient Encryption Key (Server Public)</span>
                        </>
                      )}
                    </div>
                    <div class="jose-minimal-key-specs">
                      <code class="jose-mono-tag">
                        {joseConfig.mode === 'jws' ? sigDesc?.alg : `${encDesc?.alg} / ${cipherDesc?.enc}`}
                      </code>
                      <span class="text-muted">
                        {joseConfig.mode === 'jws' ? sigDesc?.family : encDesc?.family}
                      </span>
                    </div>
                  </div>

                  <div class="jose-minimal-upload-row">
                    <input
                      type="file"
                      id="jose-file-input"
                      class="jose-file-hidden"
                      accept=".pem,.jwk,.key,.der,.crt,.cer,.json"
                      x-on:change="
                        const file = $event.target.files[0];
                        if (file) {
                          joseKeyName = file.name;
                          const isDer = file.name.toLowerCase().endsWith('.der') || file.name.toLowerCase().endsWith('.cer') || file.name.toLowerCase().endsWith('.crt');
                          const reader = new FileReader();
                          if (isDer) {
                            reader.onload = (e) => {
                              const bytes = new Uint8Array(e.target.result);
                              let binary = '';
                              for (let i = 0; i < bytes.byteLength; i++) {
                                binary += String.fromCharCode(bytes[i]);
                              }
                              joseKeyContent = 'der:base64:' + btoa(binary);
                              joseKeyStatus = file.name;
                              if (window.inspectJoseKey) {
                                joseKeyInspector = window.inspectJoseKey(joseKeyContent, file.name);
                                const expectedFam = (joseSecurityJson && JSON.parse(joseSecurityJson).mode === 'jws') ? expectedSignFamily : expectedEncFamily;
                                const expectedRole = (joseSecurityJson && JSON.parse(joseSecurityJson).mode === 'jws') ? 'private' : 'public';
                                joseKeyCompat = window.checkJoseKeyCompatibility(joseKeyInspector.family, joseKeyInspector.role, expectedFam, expectedRole);
                              }
                            };
                            reader.readAsArrayBuffer(file);
                          } else {
                            reader.onload = (e) => {
                              joseKeyContent = e.target.result;
                              joseKeyStatus = file.name;
                              if (window.inspectJoseKey) {
                                joseKeyInspector = window.inspectJoseKey(joseKeyContent, file.name);
                                const expectedFam = (joseSecurityJson && JSON.parse(joseSecurityJson).mode === 'jws') ? expectedSignFamily : expectedEncFamily;
                                const expectedRole = (joseSecurityJson && JSON.parse(joseSecurityJson).mode === 'jws') ? 'private' : 'public';
                                joseKeyCompat = window.checkJoseKeyCompatibility(joseKeyInspector.family, joseKeyInspector.role, expectedFam, expectedRole);
                                if (joseKeyInspector.kid && !joseKid) {
                                  joseKid = joseKeyInspector.kid;
                                }
                              }
                            };
                            reader.readAsText(file);
                          }
                        }
                      "
                    />
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      x-on:click="document.getElementById('jose-file-input').click()"
                    >
                      <IconKey width={11} height={11} /> Select Key File
                    </button>

                    <template x-if="joseKeyContent">
                      <div class="jose-minimal-upload-row">
                        <span class="jose-minimal-file-badge">
                          <span x-text="joseKeyName"></span>
                          <span class="text-muted" x-text="joseKeyInspector?.format ? `(${joseKeyInspector.format})` : ''"></span>
                        </span>
                        <span x-bind:class="joseKeyCompat?.valid ? 'jose-compat-mini-tag valid' : 'jose-compat-mini-tag invalid'">
                          <IconCheck width={10} height={10} /> <span x-text="joseKeyCompat?.msg"></span>
                        </span>
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          x-on:click="joseKeyContent = ''; joseKeyName = ''; joseKeyStatus = 'No key loaded'; joseKeyInspector = null; document.getElementById('jose-file-input').value = ''"
                          title="Clear key"
                        >
                          <IconClose width={11} height={11} />
                        </button>
                      </div>
                    </template>

                    <template x-if="!joseKeyContent">
                      <div class="jose-no-key-row">
                        <span class="text-subtle">
                          Supports PEM, JWK, or DER
                        </span>
                        <template x-if="defaultKeyText">
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            x-on:click="joseKeyContent = defaultKeyText; joseKeyName = 'Default Spec Key'; joseKeyStatus = 'Default key loaded'; joseKeyCompat = { valid: true, msg: 'Default key from specification' }"
                          >
                            Use Default Key
                          </button>
                        </template>
                      </div>
                    </template>
                  </div>

                  <div class={joseConfig.mode === 'jws' ? 'jose-minimal-inputs' : 'param-row'}>
                    <input
                      type="text"
                      class="input input-sm"
                      x-model="joseKid"
                      placeholder={defaultKid ? `kid: ${defaultKid}` : "Key ID (kid) - optional"}
                      autocomplete="off"
                    />
                    {joseConfig.mode === 'jws' && (
                      <input
                        type="password"
                        class="input input-sm"
                        x-model="josePassphrase"
                        placeholder="Passphrase (optional)"
                        autocomplete="new-password"
                      />
                    )}
                  </div>

                  <div class="jose-box-divider"></div>
                  {joseConfig.mode === 'jws' ? (
                    <>
                      <JoseProtectedHeadersBuilder
                        title="JWS Protected Headers"
                        subtitle="(RFC 7515 Parameters)"
                        headersVar="joseSignHeaders"
                        placeholderKey="Header Name (e.g. x-tenant-id, typ, b64)"
                        emptyText='No custom JWS protected headers configured. Click "+ Add Header" to append parameters (e.g. x-tenant-id, typ, b64).'
                      />
                      <div class="jose-box-divider"></div>
                      <JosePayloadClaimsBuilder
                        title="JWS Payload Claims"
                        subtitle="(RFC 7519 Claims Set)"
                        claimsVar="joseClaims"
                        placeholderKey="Claim Name (e.g. iss, aud, sub, scope)"
                        emptyText='No custom JWS payload claims configured. Click "+ Add Claim" to append claims (e.g. iss, aud, sub, scope).'
                      />
                    </>
                  ) : (
                    <>
                      <JoseProtectedHeadersBuilder
                        title="JWE Protected Headers"
                        subtitle="(RFC 7516 Parameters)"
                        headersVar="joseEncHeaders"
                        placeholderKey="Header Name (e.g. cty, zip, enc-purpose)"
                        emptyText='No custom JWE protected headers configured. Click "+ Add Header" to append parameters (e.g. cty, zip, enc-purpose).'
                      />
                      <div class="jose-box-divider"></div>
                      <JosePayloadClaimsBuilder
                        title="JWE Payload Claims"
                        subtitle="(RFC 7519 Encrypted Claims Set)"
                        claimsVar="joseEncClaims"
                        placeholderKey="Claim Name (e.g. sub, iss, tenantId, scope)"
                        emptyText='No custom JWE payload claims configured. Click "+ Add Claim" to append encrypted claims (e.g. sub, iss, tenantId, scope).'
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}

              {/* Optional Custom Overrides (Query / Headers) */}
              <div x-show="showCustomInputs" class="custom-overrides-card" x-cloak>
                <div class="custom-overrides-header">
                  <span class="custom-overrides-title">Optional Custom Overrides</span>
                  <span class="text-subtle font-sm">Ad-hoc query parameters or headers for manual testing</span>
                </div>

                <div class="kv-section">
                  <div class="kv-builder-header">
                    <span class="form-label">Custom Query Parameters</span>
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs"
                      x-on:click="queryParams.push({ key: '', value: '', enabled: true, fromSpec: false, required: false })"
                    >
                      + Add Param
                    </button>
                  </div>
                  <div class="kv-builder-rows">
                    <template x-if="queryParams.length === 0">
                      <span class="text-subtle font-sm">No custom query parameters added.</span>
                    </template>
                    <template x-for="(q, idx) in queryParams" x-bind:key="idx">
                      <div class="kv-row">
                        <input
                          type="checkbox"
                          class="kv-checkbox"
                          x-model="q.enabled"
                          x-bind:disabled="q.required"
                        />
                        <input
                          type="text"
                          x-bind:class="q.fromSpec ? 'kv-input kv-input-readonly' : 'kv-input'"
                          placeholder="Key"
                          x-model="q.key"
                          x-bind:readonly="q.fromSpec"
                        />
                        <div class="kv-divider"></div>
                        <input type="text" class="kv-input" placeholder="Value" x-model="q.value" />
                        <template x-if="!q.required">
                          <button
                            type="button"
                            class="kv-remove-btn"
                            x-on:click="queryParams.splice(idx, 1)"
                            aria-label="Remove"
                          ><IconClose width={12} height={12} /></button>
                        </template>
                      </div>
                    </template>
                  </div>
                </div>

                <div class="kv-section">
                  <div class="kv-builder-header">
                    <span class="form-label">Custom HTTP Headers</span>
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs"
                      x-on:click="headers.push({ key: '', value: '', enabled: true, fromSpec: false, required: false })"
                    >
                      + Add Header
                    </button>
                  </div>
                  <div class="kv-builder-rows">
                    <template x-if="headers.length === 0">
                      <span class="text-subtle font-sm">No custom headers added.</span>
                    </template>
                    <template x-for="(h, idx) in headers" x-bind:key="idx">
                      <div class="kv-row">
                        <input
                          type="checkbox"
                          class="kv-checkbox"
                          x-model="h.enabled"
                          x-bind:disabled="h.required"
                        />
                        <input
                          type="text"
                          x-bind:class="h.fromSpec ? 'kv-input kv-input-readonly' : 'kv-input'"
                          placeholder="Header Name"
                          x-model="h.key"
                          x-bind:readonly="h.fromSpec"
                        />
                        <div class="kv-divider"></div>
                        <input type="text" class="kv-input" placeholder="Value" x-model="h.value" />
                        <template x-if="!h.required">
                          <button
                            type="button"
                            class="kv-remove-btn"
                            x-on:click="headers.splice(idx, 1)"
                            aria-label="Remove"
                          ><IconClose width={12} height={12} /></button>
                        </template>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div class="no-input-endpoint-card">
            <div class="no-input-icon-wrap">
              <IconCheck width={18} height={18} />
            </div>
            <div class="no-input-text-wrap">
              <div class="no-input-title-row">
                <span class="no-input-title">No Input Required</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-subtle"
                  x-on:click="showCustomInputs = !showCustomInputs"
                >
                  <span x-text="showCustomInputs ? '− Hide Custom Overrides' : '+ Custom Query / Headers (Optional)'"></span>
                </button>
              </div>
              <p class="no-input-desc">
                This endpoint does not declare any parameters, request body, headers, or authentication credentials in the OpenAPI specification. All parameters are self-contained in the request URL. Click <strong>Send Request</strong> to execute.
              </p>

              <div x-show="showCustomInputs" class="custom-overrides-drawer" x-cloak>
                <div class="kv-section">
                  <div class="kv-builder-header">
                    <span class="form-label">Custom Query Parameters</span>
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs"
                      x-on:click="queryParams.push({ key: '', value: '', enabled: true, fromSpec: false, required: false })"
                    >
                      + Add Param
                    </button>
                  </div>
                  <div class="kv-builder-rows">
                    <template x-if="queryParams.length === 0">
                      <span class="text-subtle font-sm">No custom query parameters added.</span>
                    </template>
                    <template x-for="(q, idx) in queryParams" x-bind:key="idx">
                      <div class="kv-row">
                        <input
                          type="checkbox"
                          class="kv-checkbox"
                          x-model="q.enabled"
                          x-bind:disabled="q.required"
                        />
                        <input
                          type="text"
                          x-bind:class="q.fromSpec ? 'kv-input kv-input-readonly' : 'kv-input'"
                          placeholder="Key"
                          x-model="q.key"
                          x-bind:readonly="q.fromSpec"
                        />
                        <div class="kv-divider"></div>
                        <input type="text" class="kv-input" placeholder="Value" x-model="q.value" />
                        <template x-if="!q.required">
                          <button
                            type="button"
                            class="kv-remove-btn"
                            x-on:click="queryParams.splice(idx, 1)"
                            aria-label="Remove"
                          ><IconClose width={12} height={12} /></button>
                        </template>
                      </div>
                    </template>
                  </div>
                </div>

                <div class="kv-section">
                  <div class="kv-builder-header">
                    <span class="form-label">Custom HTTP Headers</span>
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs"
                      x-on:click="headers.push({ key: '', value: '', enabled: true, fromSpec: false, required: false })"
                    >
                      + Add Header
                    </button>
                  </div>
                  <div class="kv-builder-rows">
                    <template x-if="headers.length === 0">
                      <span class="text-subtle font-sm">No custom headers added.</span>
                    </template>
                    <template x-for="(h, idx) in headers" x-bind:key="idx">
                      <div class="kv-row">
                        <input
                          type="checkbox"
                          class="kv-checkbox"
                          x-model="h.enabled"
                          x-bind:disabled="h.required"
                        />
                        <input
                          type="text"
                          x-bind:class="h.fromSpec ? 'kv-input kv-input-readonly' : 'kv-input'"
                          placeholder="Header Name"
                          x-model="h.key"
                          x-bind:readonly="h.fromSpec"
                        />
                        <div class="kv-divider"></div>
                        <input type="text" class="kv-input" placeholder="Value" x-model="h.value" />
                        <template x-if="!h.required">
                          <button
                            type="button"
                            class="kv-remove-btn"
                            x-on:click="headers.splice(idx, 1)"
                            aria-label="Remove"
                          ><IconClose width={12} height={12} /></button>
                        </template>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  </div>
)
}

function formatContentTypeLabel(contentType: string): string {
  const ct = contentType.toLowerCase().trim()
  if (ct === 'application/x-www-form-urlencoded') return 'form-urlencoded'
  if (ct === 'application/json') return 'json'
  if (ct.includes('json')) return ct.split('/')[1] || 'json'
  if (ct === 'multipart/form-data' || ct.includes('multipart')) return 'multipart'
  if (ct === 'application/xml' || ct === 'text/xml' || ct.includes('xml')) return 'xml'
  if (ct === 'text/plain') return 'text'
  if (ct === 'text/csv') return 'csv'
  if (ct === 'text/html') return 'html'
  if (ct === 'application/octet-stream') return 'binary'
  if (ct.startsWith('image/')) return ct.replace('image/', '')
  return ct.includes('/') ? ct.split('/')[1] : ct
}

function objectToUrlEncoded(obj: unknown): string {
  if (typeof obj === 'string') return obj
  if (!obj || typeof obj !== 'object') return String(obj ?? '')
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined && v !== null) {
      params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
  }
  return params.toString()
}

function objectToXml(obj: unknown, rootTag = 'root', indent = '  '): string {
  if (typeof obj === 'string') return obj
  if (!obj || typeof obj !== 'object') return `<${rootTag}>${String(obj ?? '')}</${rootTag}>`
  if (Array.isArray(obj)) {
    return obj.map((item) => objectToXml(item, 'item', indent)).join('\n')
  }
  const lines: string[] = [`<${rootTag}>`]
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined && v !== null) {
      if (typeof v === 'object') {
        const nested = objectToXml(v, k, indent + '  ')
        lines.push(`${indent}${nested}`)
      } else {
        lines.push(`${indent}<${k}>${String(v)}</${k}>`)
      }
    }
  }
  lines.push(`</${rootTag}>`)
  return lines.join('\n')
}

function objectToMultipartSample(obj: unknown): string {
  if (typeof obj === 'string') return obj
  if (!obj || typeof obj !== 'object') return String(obj ?? '')
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    lines.push(`--${boundary}`)
    lines.push(`Content-Disposition: form-data; name="${k}"`)
    lines.push('')
    lines.push(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))
  }
  lines.push(`--${boundary}--`)
  return lines.join('\r\n')
}

function getSampleBodyForContentType(
  endpoint: EndpointOperation,
  contentType: string,
  spec?: OpenApiDocument
): string {
  if (!endpoint.requestBody?.content) return ''

  const content = endpoint.requestBody.content
  let mediaObj = content[contentType]
  if (!mediaObj) {
    const matchingKey = Object.keys(content).find((k) =>
      k.toLowerCase().includes(contentType.toLowerCase())
    )
    if (matchingKey) {
      mediaObj = content[matchingKey]
    } else {
      const firstKey = Object.keys(content)[0]
      if (firstKey) mediaObj = content[firstKey]
    }
  }

  if (!mediaObj) return ''

  const ct = contentType.toLowerCase()
  const isFormUrlEncoded = ct.includes('form-urlencoded')
  const isXml = ct.includes('xml')
  const isMultipart = ct.includes('multipart')
  const isText = ct.startsWith('text/') && !isXml

  const formatSample = (val: unknown): string => {
    if (typeof val === 'string') return val
    if (isFormUrlEncoded) return objectToUrlEncoded(val)
    if (isXml) return objectToXml(val)
    if (isMultipart) return objectToMultipartSample(val)
    if (isText) return typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)
    return JSON.stringify(val, null, 2)
  }

  if (mediaObj.example !== undefined) {
    return formatSample(mediaObj.example)
  }

  if (mediaObj.examples) {
    const firstExKey = Object.keys(mediaObj.examples)[0]
    if (firstExKey && mediaObj.examples[firstExKey]?.value !== undefined) {
      return formatSample(mediaObj.examples[firstExKey].value)
    }
  }

  if (!mediaObj.schema) return ''

  const sample = generateSampleFromSchema(mediaObj.schema, spec, new Set())
  if (sample === undefined) return ''

  return formatSample(sample)
}

function getDefaultSampleBody(endpoint: EndpointOperation, spec?: OpenApiDocument): string {
  const declaredContentTypes = endpoint.requestBody?.content ? Object.keys(endpoint.requestBody.content) : []
  const firstType = declaredContentTypes[0] || 'application/json'
  return getSampleBodyForContentType(endpoint, firstType, spec)
}

function generateSampleFromSchema(
  schema: SchemaObject | undefined,
  spec?: OpenApiDocument,
  visited = new Set<string>()
): unknown {
  if (!schema) return undefined

  if (schema.$ref) {
    const refStr = schema.$ref
    if (visited.has(refStr)) return {}
    visited.add(refStr)

    const resolved = resolveSchemaRef(refStr, spec)
    if (resolved) {
      return generateSampleFromSchema(resolved, spec, visited)
    }
  }

  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default

  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0]
  }

  const type = schema.type || (schema.properties ? 'object' : schema.items ? 'array' : 'string')

  if (type === 'object' || schema.properties) {
    const obj: Record<string, unknown> = {}
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        obj[propName] = generateSampleFromSchema(propSchema, spec, new Set(visited))
      }
    }
    return obj
  }

  if (type === 'array' || schema.items) {
    const itemSample = generateSampleFromSchema(schema.items, spec, new Set(visited))
    return itemSample !== undefined ? [itemSample] : []
  }

  if (type === 'integer' || type === 'number') {
    return 1
  }

  if (type === 'boolean') {
    return true
  }

  if (type === 'string') {
    if (schema.format === 'date-time') return new Date().toISOString()
    if (schema.format === 'date') return new Date().toISOString().split('T')[0]
    if (schema.format === 'email') return 'user@example.com'
    if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000'
    return 'string'
  }

  return 'sample'
}

function resolveSchemaRef(refStr: string, spec?: OpenApiDocument): SchemaObject | null {
  if (!refStr || !spec) return null
  if (refStr.startsWith('#/components/schemas/')) {
    const schemaName = refStr.replace('#/components/schemas/', '')
    if (spec.components?.schemas?.[schemaName]) {
      return spec.components.schemas[schemaName]
    }
    if (spec.schemas?.[schemaName]) {
      return spec.schemas[schemaName]
    }
  }
  return null
}

function extractInitialBodyFields(
  endpoint: EndpointOperation,
  contentType: string,
  spec?: OpenApiDocument,
  sampleBody?: string
): Array<{
  key: string
  value: string
  type: string
  enabled: boolean
  required: boolean
  fromSpec: boolean
  description?: string
}> {
  const fields: Array<{
    key: string
    value: string
    type: string
    enabled: boolean
    required: boolean
    fromSpec: boolean
    description?: string
  }> = []

  const mediaObj = endpoint.requestBody?.content?.[contentType]
  let schema = mediaObj?.schema

  if (schema?.$ref) {
    schema = resolveSchemaRef(schema.$ref, spec) || schema
  }

  if (schema?.properties) {
    const requiredList = schema.required || []
    for (const [propName, rawProp] of Object.entries(schema.properties)) {
      let propSchema = rawProp as SchemaObject
      if (propSchema.$ref) {
        propSchema = resolveSchemaRef(propSchema.$ref, spec) || propSchema
      }
      const isReq = requiredList.includes(propName)
      let defaultVal = ''
      if (propSchema.example !== undefined) {
        defaultVal = typeof propSchema.example === 'object' ? JSON.stringify(propSchema.example) : String(propSchema.example)
      } else if (propSchema.default !== undefined) {
        defaultVal = typeof propSchema.default === 'object' ? JSON.stringify(propSchema.default) : String(propSchema.default)
      } else if (propSchema.enum && propSchema.enum.length > 0) {
        defaultVal = String(propSchema.enum[0])
      } else if (propSchema.type === 'integer' || propSchema.type === 'number') {
        defaultVal = '1'
      } else if (propSchema.type === 'boolean') {
        defaultVal = 'true'
      } else if (propSchema.type === 'array') {
        defaultVal = '[]'
      } else if (propSchema.type === 'object') {
        defaultVal = '{}'
      }

      fields.push({
        key: propName,
        value: defaultVal,
        type: propSchema.type || (typeof defaultVal === 'number' ? 'number' : typeof defaultVal === 'boolean' ? 'boolean' : 'string'),
        enabled: true,
        required: isReq,
        fromSpec: true,
        description: propSchema.description
      })
    }
  }

  // Fallback: If no schema properties were found, try parsing the sampleBody
  if (fields.length === 0 && sampleBody) {
    const trimmed = sampleBody.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            fields.push({
              key: k,
              value: typeof v === 'object' ? JSON.stringify(v) : String(v !== undefined && v !== null ? v : ''),
              type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string',
              enabled: true,
              required: false,
              fromSpec: true
            })
          }
        }
      } catch {}
    } else if (contentType.toLowerCase().includes('form-urlencoded')) {
      try {
        const params = new URLSearchParams(trimmed)
        params.forEach((v, k) => {
          fields.push({
            key: k,
            value: v,
            type: 'string',
            enabled: true,
            required: false,
            fromSpec: true
          })
        })
      } catch {}
    }
  }

  return fields
}
