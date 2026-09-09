import { jsx } from 'hono/jsx'
import { MethodBadge } from './method-badge'
import { RequestPanel } from './request-panel'
import { ResponsePanel } from './response-panel'
import { IconLock, IconUnlock } from './icons'
import {
  EndpointOperation,
  OpenApiDocument,
  ParameterItem,
  ResponseItem,
  SchemaObject
} from '../types/openapi'
import { resolveEndpointSecurity } from '../utils/auth-metadata'

export interface SpecDetailProps {
  spec: OpenApiDocument
  endpoint: EndpointOperation
}

export const SpecDetail = ({ spec, endpoint }: SpecDetailProps) => {
  const security = resolveEndpointSecurity(endpoint, spec)

  return (
    <div class="spec-detail-wrapper" id={endpoint.id} data-endpoint-id={endpoint.id}>

      {/* 1. Compact Endpoint Header */}
      <section class="detail-header-section">
        <div class="detail-title-row">
          <MethodBadge method={endpoint.method} />
          <span class="path-display">{endpoint.path}</span>

          {endpoint.deprecated && (
            <span class="badge badge-danger">Deprecated</span>
          )}

          {security.isSecured && (
            <button
              type="button"
              class="badge badge-security"
              title={`Protected by: ${security.schemes.map((s) => s.name).join(', ')}. Click to configure authentication.`}
              x-on:click={`$dispatch('focus-auth-tab', { endpointId: '${endpoint.id}' })`}
            >
              <IconLock width={11} height={11} />
              <span>{security.primaryScheme?.name || 'Auth'}</span>
            </button>
          )}

          {security.isExplicitlyUnsecured && (
            <span class="badge badge-subtle" title="Explicitly unauthenticated (operation.security = [])">
              <IconUnlock width={11} height={11} />
              <span>Public</span>
            </span>
          )}

          {endpoint.joseSecurity && (
            <span class="badge badge-jose-active" title="Requires JOSE Signing / Encryption">
              <IconLock width={11} height={11} />
              JOSE: {endpoint.joseSecurity.mode?.toUpperCase()}
            </span>
          )}

          <div class="detail-tags-row">
            {endpoint.tags && endpoint.tags.map((tag) => (
              <span key={tag} class="badge">{tag}</span>
            ))}
            {endpoint.externalDocs && (
              <a
                href={endpoint.externalDocs.url}
                target="_blank"
                rel="noreferrer"
                class="external-link"
              >
                External Docs ↗
              </a>
            )}
          </div>
        </div>

        {endpoint.summary && (
          <h1 class="detail-summary">{endpoint.summary}</h1>
        )}

        {endpoint.description && endpoint.description !== endpoint.summary && (
          <p class="detail-description">{endpoint.description}</p>
        )}
      </section>

      {/* 2. Request Runner */}
      <section class="detail-section">
        <RequestPanel spec={spec} endpoint={endpoint} />
        <div id="response-panel-container">
          <ResponsePanel />
        </div>
      </section>

      {/* 3. Parameters Table */}
      {endpoint.parameters && endpoint.parameters.length > 0 && (
        <section class="detail-section">
          <h2 class="section-title">Parameters</h2>
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>In</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {endpoint.parameters.map((param: ParameterItem, index: number) => (
                  <tr key={param.name + index}>
                    <td class="param-name">{param.name}</td>
                    <td><span class="badge">{param.in}</span></td>
                    <td class="param-type">
                      {param.schema?.type || 'string'}
                      {param.schema?.format && ` (${param.schema.format})`}
                    </td>
                    <td>
                      {param.required ? (
                        <span class="badge-required">required</span>
                      ) : (
                        <span class="badge-optional">optional</span>
                      )}
                    </td>
                    <td class="param-type">{param.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. Request Body */}
      {endpoint.requestBody && (
        <section class="detail-section">
          <h2 class="section-title">
            Request Body
            {endpoint.requestBody.required && (
              <span class="badge-required">required</span>
            )}
          </h2>
          {endpoint.requestBody.description && (
            <p class="detail-description">{endpoint.requestBody.description}</p>
          )}
          {endpoint.requestBody.content &&
            Object.entries(endpoint.requestBody.content).map(([mediaType, mediaObj]) => (
              <div key={mediaType} class="response-card">
                <div class="param-name">Content-Type: {mediaType}</div>
                {mediaObj.schema && renderSchemaProperties(mediaObj.schema)}
              </div>
            ))}
        </section>
      )}

      {/* 5. Responses */}
      {endpoint.responses && endpoint.responses.length > 0 && (
        <section class="detail-section">
          <h2 class="section-title">Responses</h2>
          <div class="response-cards-stack">
            {endpoint.responses.map((res: ResponseItem) => {
              const statusCodeNum = parseInt(res.statusCode, 10)
              let statusClass = 'status-badge status-2xx'
              if (statusCodeNum >= 400 && statusCodeNum < 500) {
                statusClass = 'status-badge status-4xx'
              } else if (statusCodeNum >= 500) {
                statusClass = 'status-badge status-5xx'
              }

              return (
                <div key={res.statusCode} class="response-card">
                  <div class="response-card-header">
                    <span class={statusClass}>{res.statusCode}</span>
                    <span class="param-name">{res.description}</span>
                  </div>
                  {res.content &&
                    Object.entries(res.content).map(([contentType, mediaObj]) => (
                      <div key={contentType}>
                        <div class="param-type">{contentType}</div>
                        {mediaObj.schema && renderSchemaProperties(mediaObj.schema)}
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function renderSchemaProperties(schema: SchemaObject, level = 0) {
  if (schema.properties) {
    return (
      <div class={level > 0 ? "schema-props schema-props-nested" : "schema-props"}>
        {Object.entries(schema.properties).map(([propName, propSchema]) => {
          const hasChildren = Boolean(propSchema.properties && Object.keys(propSchema.properties).length > 0)
          const isArrayOfObjects = Boolean(propSchema.items?.properties && Object.keys(propSchema.items.properties).length > 0)

          return (
            <div key={propName} class="schema-prop-item">
              <div class="schema-prop-row">
                {level > 0 && <span class="schema-tree-guide">↳</span>}
                <span class="param-name">{propName}</span>
                <span class="param-type">
                  {propSchema.type || (hasChildren ? 'object' : 'string')}
                  {propSchema.format ? ` (${propSchema.format})` : ''}
                </span>
                {schema.required?.includes(propName) && (
                  <span class="badge-required">required</span>
                )}
                {propSchema.description && (
                  <span class="param-desc">{propSchema.description}</span>
                )}
              </div>
              {hasChildren && renderSchemaProperties(propSchema, level + 1)}
              {isArrayOfObjects && propSchema.items && renderSchemaProperties(propSchema.items, level + 1)}
            </div>
          )
        })}
      </div>
    )
  }

  if (schema.items) {
    return (
      <div class={level > 0 ? "schema-props schema-props-nested" : "schema-props"}>
        <div class="schema-prop-item">
          <div class="schema-prop-row">
            {level > 0 && <span class="schema-tree-guide">↳</span>}
            <span class="param-name">[items]</span>
            <span class="param-type">{schema.items.type || 'object'}</span>
          </div>
          {schema.items.properties && renderSchemaProperties(schema.items, level + 1)}
        </div>
      </div>
    )
  }

  if (schema.type) {
    return (
      <div class="param-type">
        Type: {schema.type} {schema.format && `(${schema.format})`}
      </div>
    )
  }

  return null
}

