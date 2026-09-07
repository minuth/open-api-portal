import { jsx } from 'hono/jsx'
import { ProxyResponseResult, ActualRequestData } from '../types/openapi'
import { JoseTransformMeta, JoseResponseMeta } from '../types/jose'
import { IconLock, IconCheck } from './icons'
import { MethodBadge } from './method-badge'

export interface ResponsePanelProps {
  result?: ProxyResponseResult
  request?: ActualRequestData
  error?: string
  joseMeta?: JoseTransformMeta
  responseJoseMeta?: JoseResponseMeta
}

export const ResponsePanel = ({
  result,
  request,
  error,
  joseMeta,
  responseJoseMeta
}: ResponsePanelProps) => {
  if (!result && !error) {
    return (
      <div class="response-panel-placeholder">
        Click <strong>Send Request</strong> to execute the API call and inspect the request and response.
      </div>
    )
  }

  // Parse Response JSON
  let prettyResJson = result?.body || ''
  let isResJson = false
  if (result?.body) {
    try {
      const parsed = JSON.parse(result.body)
      prettyResJson = JSON.stringify(parsed, null, 2)
      isResJson = true
    } catch {
      // Keep as plain text
    }
  }

  // Parse Request JSON
  let prettyReqJson = request?.body || ''
  if (request?.body) {
    try {
      const parsedReq = JSON.parse(request.body)
      prettyReqJson = JSON.stringify(parsedReq, null, 2)
    } catch {
      // Keep as plain text
    }
  }

  const statusClass = result
    ? result.statusCode >= 200 && result.statusCode < 300
      ? 'status-badge status-2xx'
      : result.statusCode >= 300 && result.statusCode < 400
      ? 'status-badge status-3xx'
      : result.statusCode >= 400 && result.statusCode < 500
      ? 'status-badge status-4xx'
      : 'status-badge status-5xx'
    : 'status-badge status-5xx'

  const alpineState = JSON.stringify({
    mainTab: 'response', // Keep response as default tab
    resTab: 'pretty',
    reqTab: 'raw-http',
    copied: false
  })

  return (
    <div class="response-panel" x-data={`(${alpineState})`}>
      {/* 1. Header Summary Bar with View Switcher */}
      <div class="response-panel-summary">
        {/* Primary Segmented Switcher: Response (default) vs. Request */}
        <div class="response-panel-switcher">
          <button
            type="button"
            class="switcher-tab"
            x-bind:class="mainTab === 'response' ? 'switcher-tab active' : 'switcher-tab'"
            x-on:click="mainTab = 'response'"
          >
            <span class="switcher-dot" x-show="mainTab === 'response'"></span>
            <span>Response</span>
          </button>
          <button
            type="button"
            class="switcher-tab"
            x-bind:class="mainTab === 'request' ? 'switcher-tab active' : 'switcher-tab'"
            x-on:click="mainTab = 'request'"
          >
            <span class="switcher-dot" x-show="mainTab === 'request'"></span>
            <span>Request</span>
          </button>
        </div>

        {/* Dynamic Context Meta: Response Meta */}
        <div class="response-panel-meta" x-show="mainTab === 'response'">
          {result ? (
            <>
              <span class={statusClass}>
                {result.statusCode} {result.statusText}
              </span>
              <span class="badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {result.latencyMs} ms
              </span>
              <span class="badge">{result.contentType}</span>
              {joseMeta && (
                <span class="badge badge-jose-active" title={`Secured with ${joseMeta.mode.toUpperCase()}`}>
                  <IconLock width={11} height={11} />
                  JOSE: {joseMeta.alg}
                </span>
              )}
              {responseJoseMeta?.decrypted && (
                <span class="badge badge-jose-active" title="Response Decrypted with Local Key">
                  <IconLock width={11} height={11} />
                  Decrypted: {responseJoseMeta.enc || 'JWE'}
                </span>
              )}
              {responseJoseMeta?.verified && !responseJoseMeta.decrypted && (
                <span class="badge badge-jose-active" title="Response Signature Verified">
                  <IconCheck width={11} height={11} /> Verified JWS
                </span>
              )}
            </>
          ) : (
            <span class="status-badge status-5xx">Failed</span>
          )}
        </div>

        {/* Dynamic Context Meta: Request Meta */}
        {request && (
          <div class="response-panel-meta" x-show="mainTab === 'request'">
            <MethodBadge method={request.method} />
            <span class="badge target-url-pill" title={request.url}>
              {request.url}
            </span>
            {joseMeta && (
              <span class="badge badge-jose-active" title={`Secured with ${joseMeta.mode.toUpperCase()}`}>
                <IconLock width={11} height={11} />
                {joseMeta.alg}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Sub-Tabs Bar with Copy Action */}
      <div class="tab-bar-with-actions">
        {/* Response Sub-Tabs */}
        <div class="tab-bar-nav" x-show="mainTab === 'response'">
          {result ? (
            <>
              <button
                type="button"
                x-on:click="resTab = 'pretty'"
                x-bind:class="resTab === 'pretty' ? 'tab-button active' : 'tab-button'"
              >
                Pretty JSON
              </button>
              <button
                type="button"
                x-on:click="resTab = 'raw'"
                x-bind:class="resTab === 'raw' ? 'tab-button active' : 'tab-button'"
              >
                Raw Text
              </button>
              <button
                type="button"
                x-on:click="resTab = 'headers'"
                x-bind:class="resTab === 'headers' ? 'tab-button active' : 'tab-button'"
              >
                Headers ({Object.keys(result.headers || {}).length})
              </button>
              {(joseMeta || responseJoseMeta) && (
                <button
                  type="button"
                  x-on:click="resTab = 'jose'"
                  x-bind:class="resTab === 'jose' ? 'tab-button active' : 'tab-button'"
                >
                  JOSE Security
                </button>
              )}
            </>
          ) : (
            <button type="button" class="tab-button active">
              Error Details
            </button>
          )}
        </div>

        {/* Request Sub-Tabs */}
        {request && (
          <div class="tab-bar-nav" x-show="mainTab === 'request'">
            <button
              type="button"
              x-on:click="reqTab = 'raw-http'"
              x-bind:class="reqTab === 'raw-http' ? 'tab-button active' : 'tab-button'"
            >
              Raw HTTP
            </button>
            <button
              type="button"
              x-on:click="reqTab = 'body'"
              x-bind:class="reqTab === 'body' ? 'tab-button active' : 'tab-button'"
            >
              Body
            </button>
            <button
              type="button"
              x-on:click="reqTab = 'headers'"
              x-bind:class="reqTab === 'headers' ? 'tab-button active' : 'tab-button'"
            >
              Headers ({Object.keys(request.headers || {}).length})
            </button>
            <button
              type="button"
              x-on:click="reqTab = 'curl'"
              x-bind:class="reqTab === 'curl' ? 'tab-button active' : 'tab-button'"
            >
              cURL
            </button>
          </div>
        )}

        {/* Copy Button for Current Tab */}
        <button
          type="button"
          class="btn-copy-tab"
          title="Copy current tab content to clipboard"
          x-on:click="
            let content = '';
            if (mainTab === 'response') {
              if (resTab === 'pretty') content = document.getElementById('response-pretty-content')?.innerText || '';
              else if (resTab === 'raw') content = document.getElementById('response-raw-content')?.innerText || '';
              else if (resTab === 'headers') content = document.getElementById('response-headers-content')?.innerText || '';
              else if (resTab === 'jose') content = document.getElementById('response-jose-content')?.innerText || '';
            } else {
              if (reqTab === 'raw-http') content = document.getElementById('request-raw-http')?.innerText || '';
              else if (reqTab === 'body') content = document.getElementById('request-body-content')?.innerText || '';
              else if (reqTab === 'headers') content = document.getElementById('request-headers-content')?.innerText || '';
              else if (reqTab === 'curl') content = document.getElementById('request-curl-content')?.innerText || '';
            }
            if (content) {
              navigator.clipboard.writeText(content);
              copied = true;
              setTimeout(() => copied = false, 1500);
            }
          "
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span x-show="!copied">Copy</span>
          <span x-show="copied" class="text-success"><IconCheck width={11} height={11} /> Copied</span>
        </button>
      </div>

      {/* 3. Tab Content Area */}
      <div class="tab-content">
        {/* VIEW 1: RESPONSE */}
        <div x-show="mainTab === 'response'">
          {error && (
            <div class="alert-error" role="alert">
              <div class="alert-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Proxy Execution Failed
              </div>
              <div>{error}</div>
            </div>
          )}

          {result && (
            <>
              {/* Pretty JSON Tab */}
              <div x-show="resTab === 'pretty'">
                <pre id="response-pretty-content" class="code-pre">{prettyResJson}</pre>
              </div>

              {/* Raw Text Tab */}
              <div x-show="resTab === 'raw'">
                <pre id="response-raw-content" class="code-pre">{result.body}</pre>
              </div>

              {/* Headers Tab */}
              <div x-show="resTab === 'headers'">
                <div id="response-headers-content" class="data-table-container">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Header</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(result.headers || {}).map(([hKey, hVal]) => (
                        <tr key={hKey}>
                          <td class="param-name">{hKey}</td>
                          <td class="param-type">{hVal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* JOSE Security Tab */}
              {(joseMeta || responseJoseMeta) && (
                <div x-show="resTab === 'jose'">
                  <div id="response-jose-content" class="data-table-container">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>JOSE Parameter</th>
                          <th>Configured Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {joseMeta && (
                          <>
                            <tr>
                              <td class="param-name">Outbound Mode</td>
                              <td><span class="badge">{joseMeta.mode.toUpperCase()}</span></td>
                            </tr>
                            <tr>
                              <td class="param-name">Algorithm (alg)</td>
                              <td class="param-type">{joseMeta.alg}</td>
                            </tr>
                            {joseMeta.enc && (
                              <tr>
                                <td class="param-name">Encryption (enc)</td>
                                <td class="param-type">{joseMeta.enc}</td>
                              </tr>
                            )}
                            <tr>
                              <td class="param-name">Key ID (kid)</td>
                              <td class="param-type">{joseMeta.kid || '(none - omitted from header)'}</td>
                            </tr>
                            <tr>
                              <td class="param-name">Placement</td>
                              <td><span class="badge">{joseMeta.placement} {joseMeta.headerName ? `(${joseMeta.headerName})` : ''}</span></td>
                            </tr>
                            {joseMeta.cty && (
                              <tr>
                                <td class="param-name">Nested Content Type (cty)</td>
                                <td class="param-type">{joseMeta.cty}</td>
                              </tr>
                            )}
                            {joseMeta.crit && joseMeta.crit.length > 0 && (
                              <tr>
                                <td class="param-name">Critical Headers (crit)</td>
                                <td class="param-type">
                                  <span class="badge badge-subtle">{joseMeta.crit.join(', ')}</span>
                                </td>
                              </tr>
                            )}
                            {joseMeta.digest && (
                              <tr>
                                <td class="param-name">
                                  {joseMeta.digestHeaderName ? `${joseMeta.digestHeaderName} Header` : 'Payload Digest'}
                                </td>
                                <td class="param-type"><code>{joseMeta.digest}</code></td>
                              </tr>
                            )}
                            {joseMeta.payloadClaims && (
                              <tr>
                                <td class="param-name">JWS Payload Claims</td>
                                <td>
                                  <pre class="meta-code-block">{JSON.stringify(joseMeta.payloadClaims, null, 2)}</pre>
                                </td>
                              </tr>
                            )}
                            {joseMeta.flePattern && (
                              <tr>
                                <td class="param-name">FLE Pattern</td>
                                <td>
                                  <span class="badge badge-jose-active">
                                    {joseMeta.flePattern === 'pure'
                                      ? 'Pure Field-Level Encryption'
                                      : joseMeta.flePattern === 'outer-signature'
                                      ? 'Outer Signature + Field-Level Encryption'
                                      : 'Nested Field-Level Encryption'}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {joseMeta.targetField && (
                              <tr>
                                <td class="param-name">Target Field</td>
                                <td class="param-type">{joseMeta.targetField}</td>
                              </tr>
                            )}
                            {joseMeta.encryptedFields && joseMeta.encryptedFields.length > 0 && (
                              <tr>
                                <td class="param-name">Encrypted Fields</td>
                                <td class="param-type">{joseMeta.encryptedFields.join(', ')}</td>
                              </tr>
                            )}
                            {joseMeta.tokenPreview && (
                              <tr>
                                <td class="param-name">Outbound Token Preview</td>
                                <td>
                                  <code class="param-type token-code-preview">{joseMeta.tokenPreview}</code>
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                        {responseJoseMeta && (
                          <>
                            <tr>
                              <td class="param-name">Response Cryptography</td>
                              <td>
                                <span class="badge badge-jose-active">
                                  {responseJoseMeta.decrypted ? 'Auto-Decrypted (JWE)' : 'Signature Verified (JWS)'}
                                </span>
                              </td>
                            </tr>
                            {responseJoseMeta.alg && (
                              <tr>
                                <td class="param-name">Response Algorithm</td>
                                <td class="param-type">{responseJoseMeta.alg}</td>
                              </tr>
                            )}
                            {responseJoseMeta.enc && (
                              <tr>
                                <td class="param-name">Response Encryption</td>
                                <td class="param-type">{responseJoseMeta.enc}</td>
                              </tr>
                            )}
                            {responseJoseMeta.rawEncryptedBody && (
                              <tr>
                                <td class="param-name">Raw Encrypted Response</td>
                                <td>
                                  <code class="param-type token-code-preview">{responseJoseMeta.rawEncryptedBody}</code>
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* VIEW 2: REQUEST (Full actual HTTP request with real data) */}
        {request && (
          <div x-show="mainTab === 'request'">
            {/* Raw HTTP Wire Request */}
            <div x-show="reqTab === 'raw-http'">
              <pre id="request-raw-http" class="code-pre">{request.rawHttp}</pre>
            </div>

            {/* Request Body (Pretty JSON or Raw) */}
            <div x-show="reqTab === 'body'">
              <div id="request-body-content">
                {request.body ? (
                  <pre class="code-pre">{prettyReqJson}</pre>
                ) : (
                  <div class="empty-state-muted">No request payload sent for this {request.method} request.</div>
                )}
              </div>
            </div>

            {/* Request Outgoing Headers */}
            <div x-show="reqTab === 'headers'">
              <div id="request-headers-content" class="data-table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Header</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(request.headers || {}).map(([hKey, hVal]) => (
                      <tr key={hKey}>
                        <td class="param-name">{hKey}</td>
                        <td class="param-type">{hVal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* cURL Command */}
            <div x-show="reqTab === 'curl'">
              <pre id="request-curl-content" class="code-pre">{request.curlCommand}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
