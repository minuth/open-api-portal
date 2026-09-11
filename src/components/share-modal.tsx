import { jsx } from 'hono/jsx'
import { SpecSummary } from '../types/openapi'
import { IconShare, IconClose, IconCopy, IconCheck, IconLink, IconChevronDown } from './icons'

export interface ShareModalProps {
  specs?: SpecSummary[]
  activeSpecId?: string
  activeSpecTitle?: string
}

export const ShareModal = ({
  specs = [],
  activeSpecId = '',
  activeSpecTitle = ''
}: ShareModalProps) => {
  const allSpecIdsJson = JSON.stringify(specs.map((s) => s.id))
  const initialSelectedJson = JSON.stringify(activeSpecId ? [activeSpecId] : [])
  const specsDataJson = JSON.stringify(
    specs.map((s) => ({
      id: s.id,
      title: s.title || s.id,
      version: s.version || ''
    }))
  )

  return (
    <div
      class="modal-backdrop"
      x-data={`{
        isOpen: false,
        isSubmitting: false,
        isGenerated: false,
        specsDropdownOpen: false,
        specsList: ${specsDataJson},
        allSpecIds: ${allSpecIdsJson},
        selectedSpecIds: ${initialSelectedJson},
        expirationHours: '24',
        isCustom: false,
        customDate: '',
        useCustomAlias: false,
        customAlias: '',
        allowSandboxUpload: false,
        copied: false,
        hasAttemptedSubmit: false,
        reset() {
          const container = document.getElementById('share-result-container');
          if (container) container.innerHTML = '';
          this.copied = false;
          this.isSubmitting = false;
          this.isGenerated = false;
          this.hasAttemptedSubmit = false;
          this.specsDropdownOpen = false;
          this.useCustomAlias = false;
          this.customAlias = '';
          this.allowSandboxUpload = false;
        },
        getSelectionSummary() {
          if (this.selectedSpecIds.length === 0) return 'Select specifications...';
          if (this.selectedSpecIds.length === 1) {
            const match = this.specsList.find(s => s.id === this.selectedSpecIds[0]);
            return match ? match.title : '1 specification selected';
          }
          if (this.selectedSpecIds.length === this.allSpecIds.length && this.allSpecIds.length > 1) {
            return 'All specifications (' + this.allSpecIds.length + ')';
          }
          return this.selectedSpecIds.length + ' specifications selected';
        }
      }`}
      x-show="isOpen"
      x-cloak
      {...{
        'x-on:open-share-modal.window':
          'isOpen = true; reset(); if ($event.detail?.specId) { selectedSpecIds = [$event.detail.specId]; } else { selectedSpecIds = []; }',
        'x-on:keydown.escape.window': 'isOpen = false; reset();'
      }}
    >
      <div
        class="modal-card modal-card-compact"
        x-show="isOpen"
        {...{
          'x-transition:enter': 'transition ease-out duration-150',
          'x-transition:enter-start': 'opacity-0 transform scale-95',
          'x-transition:enter-end': 'opacity-100 transform scale-100'
        }}
      >
        {/* Modal Header */}
        <div class="modal-header">
          <h2 class="modal-title">
            <IconShare width={16} height={16} />
            <span>Create Public Share Link</span>
          </h2>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="isOpen = false; reset();"
            title="Close modal"
          >
            <IconClose width={14} height={14} />
          </button>
        </div>

        {/* Modal Body */}
        <div class="modal-body">
          <form
            id="share-form"
            hx-post="/api/share/create"
            hx-target="#share-result-container"
            hx-swap="innerHTML"
            hx-indicator="#share-spinner"
            hx-disabled-elt="#share-submit-btn"
            x-on:submit="if (selectedSpecIds.length === 0) { hasAttemptedSubmit = true; $event.preventDefault(); return false; } if (isSubmitting) { $event.preventDefault(); return false; } isSubmitting = true;"
            {...{
              'x-on:htmx:before-request': 'isSubmitting = true',
              'x-on:htmx:after-request': 'isSubmitting = false',
              'x-on:htmx:after-swap': "if ($event.detail.target && $event.detail.target.id === 'share-result-container' && $event.detail.xhr && $event.detail.xhr.status < 400) { isGenerated = true; }"
            }}
          >
            {/* 1. Multiple Specification Choice (Compact Dropdown) */}
            <div class="form-group">
              <label class="form-label">
                Included Specifications
                <span
                  class="share-spec-count"
                  x-show="selectedSpecIds.length > 0"
                  x-text="'(' + selectedSpecIds.length + ' selected)'"
                ></span>
              </label>

              <div
                class="share-dropdown-wrapper"
                {...{ 'x-on:click.outside': 'specsDropdownOpen = false' }}
              >
                {/* Dropdown Trigger Button */}
                <button
                  type="button"
                  class="share-dropdown-trigger"
                  x-bind:class="specsDropdownOpen ? 'active' : ''"
                  x-on:click="specsDropdownOpen = !specsDropdownOpen"
                  aria-haspopup="listbox"
                  x-bind:aria-expanded="specsDropdownOpen"
                >
                  <div class="share-dropdown-trigger-label">
                    <span
                      class="share-dropdown-text"
                      x-bind:class="selectedSpecIds.length === 0 ? 'text-muted' : 'text-main font-medium'"
                      x-text="getSelectionSummary()"
                    ></span>
                  </div>
                  <div class="share-dropdown-trigger-right">
                    <span
                      class="badge badge-subtle font-xs"
                      x-show="selectedSpecIds.length > 1"
                      x-text="selectedSpecIds.length"
                    ></span>
                    <IconChevronDown
                      width={12}
                      height={12}
                      class="share-dropdown-chevron"
                      x-bind:class="specsDropdownOpen ? 'rotated' : ''"
                    />
                  </div>
                </button>

                {/* Dropdown Popover Menu */}
                <div
                  class="share-dropdown-menu"
                  x-show="specsDropdownOpen"
                  x-cloak
                  {...{
                    'x-transition:enter': 'transition ease-out duration-100',
                    'x-transition:enter-start': 'opacity-0 transform scale-95',
                    'x-transition:enter-end': 'opacity-100 transform scale-100',
                    'x-transition:leave': 'transition ease-in duration-75',
                    'x-transition:leave-start': 'opacity-100 transform scale-100',
                    'x-transition:leave-end': 'opacity-0 transform scale-95'
                  }}
                >
                  {/* Dropdown Actions Header */}
                  {specs.length > 1 && (
                    <div class="share-dropdown-header">
                      <span
                        class="font-xs text-muted"
                        x-text="selectedSpecIds.length + ' of ' + allSpecIds.length + ' selected'"
                      ></span>
                      <button
                        type="button"
                        class="share-select-all-btn"
                        {...{
                          'x-on:click.stop':
                            'selectedSpecIds.length === allSpecIds.length ? selectedSpecIds = [] : selectedSpecIds = [...allSpecIds]'
                        }}
                        x-text="selectedSpecIds.length === allSpecIds.length ? 'Clear All' : 'Select All'"
                      >
                        Select All
                      </button>
                    </div>
                  )}

                  {/* Dropdown Options List */}
                  {specs.length > 0 ? (
                    <div class="share-dropdown-list">
                      {specs.map((s) => (
                        <label class="share-dropdown-item" key={s.id}>
                          <input
                            type="checkbox"
                            name="specIds"
                            value={s.id}
                            class="share-spec-checkbox"
                            x-model="selectedSpecIds"
                          />
                          <span class="share-dropdown-item-title" title={s.title}>
                            {s.title}
                          </span>
                          {s.version && (
                            <span class="badge badge-subtle font-xs">v{s.version}</span>
                          )}
                          {s.isTemporary && (
                            <span class="badge badge-warning font-xs">Sandbox</span>
                          )}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div class="share-dropdown-empty">No specifications available.</div>
                  )}
                </div>
              </div>

              <div
                x-show="hasAttemptedSubmit && selectedSpecIds.length === 0"
                x-cloak
                class="share-spec-error-hint"
              >
                Please select at least one specification to generate a share link.
              </div>
            </div>

            {/* 2. Expiration Duration Presets */}
            <div class="form-group">
              <label class="form-label">Link Expiration</label>
              <div class="share-presets-bar">
                <button
                  type="button"
                  class="share-preset-btn"
                  x-bind:class="!isCustom && expirationHours === '1' ? 'active' : ''"
                  x-on:click="isCustom = false; expirationHours = '1'"
                >
                  1 hour
                </button>
                <button
                  type="button"
                  class="share-preset-btn"
                  x-bind:class="!isCustom && expirationHours === '24' ? 'active' : ''"
                  x-on:click="isCustom = false; expirationHours = '24'"
                >
                  24 hours
                </button>
                <button
                  type="button"
                  class="share-preset-btn"
                  x-bind:class="!isCustom && expirationHours === '168' ? 'active' : ''"
                  x-on:click="isCustom = false; expirationHours = '168'"
                >
                  7 days
                </button>
                <button
                  type="button"
                  class="share-preset-btn"
                  x-bind:class="!isCustom && expirationHours === '720' ? 'active' : ''"
                  x-on:click="isCustom = false; expirationHours = '720'"
                >
                  30 days
                </button>
                <button
                  type="button"
                  class="share-preset-btn"
                  x-bind:class="!isCustom && expirationHours === 'never' ? 'active' : ''"
                  x-on:click="isCustom = false; expirationHours = 'never'"
                >
                  Never
                </button>
                <button
                  type="button"
                  class="share-preset-btn"
                  x-bind:class="isCustom ? 'active' : ''"
                  x-on:click="isCustom = true"
                >
                  Custom
                </button>
              </div>

              {/* Hidden inputs for expiration parameters */}
              <input
                type="hidden"
                name="expiresInHours"
                x-bind:value="isCustom ? '' : expirationHours"
              />
              <input
                type="hidden"
                name="neverExpires"
                x-bind:value="!isCustom && expirationHours === 'never' ? 'true' : 'false'"
              />

              {/* Custom Date Input */}
              <div x-show="isCustom" x-cloak class="mt-2">
                <input
                  type="datetime-local"
                  name="customExpiresAt"
                  class="input"
                  x-model="customDate"
                  x-bind:required="isCustom"
                />
              </div>
            </div>

            {/* 3. Link Options & Permissions */}
            <div class="form-group share-options-section">
              <label class="form-label">Permissions &amp; Options</label>

              {/* Sandbox Upload Permission */}
              <div class="share-option-card">
                <label class="share-option-checkbox-label">
                  <input
                    type="checkbox"
                    name="allowSandboxUpload"
                    value="true"
                    class="share-spec-checkbox"
                    x-model="allowSandboxUpload"
                  />
                  <div class="share-option-info">
                    <span class="share-option-name">Allow Sandbox Upload</span>
                    <span class="share-option-help">Allow external viewers to upload and test temporary OpenAPI files in this shared session.</span>
                  </div>
                </label>
              </div>

              {/* Custom URL Alias */}
              <div class="share-option-card">
                <label class="share-option-checkbox-label">
                  <input
                    type="checkbox"
                    name="useCustomAlias"
                    value="true"
                    class="share-spec-checkbox"
                    x-model="useCustomAlias"
                  />
                  <div class="share-option-info">
                    <span class="share-option-name">Custom URL Alias</span>
                    <span class="share-option-help">Use a unique readable link slug instead of an opaque token.</span>
                  </div>
                </label>

                <div x-show="useCustomAlias" x-cloak class="share-alias-field">
                  <div class="alias-input-wrapper">
                    <span class="alias-prefix font-mono font-xs">/shared/</span>
                    <input
                      type="text"
                      name="customAlias"
                      x-model="customAlias"
                      class="input font-mono alias-input"
                      placeholder="e.g. payments-api"
                      maxlength={60}
                      pattern="[a-zA-Z0-9_-]+"
                      x-bind:required="useCustomAlias"
                      autocomplete="off"
                    />
                  </div>
                  <span class="font-xs text-muted">2–60 characters (letters, numbers, dashes, underscores). Must be unique.</span>
                </div>
              </div>
            </div>

            {/* Action Bar (Only shown before generation) */}
            <div class="modal-footer" x-show="!isGenerated">
              <button
                type="button"
                class="btn btn-secondary"
                x-on:click="isOpen = false; reset();"
              >
                <span>Cancel</span>
              </button>
              <button
                id="share-submit-btn"
                type="submit"
                class="btn btn-primary"
                x-bind:disabled="selectedSpecIds.length === 0 || isSubmitting"
              >
                <span
                  id="share-spinner"
                  class="htmx-indicator btn-spinner"
                  aria-hidden="true"
                ></span>
                <span class="btn-label-idle" x-show="!isSubmitting">
                  <IconLink width={13} height={13} />
                  <span>Generate Link</span>
                </span>
                <span class="htmx-indicator btn-label-loading" x-show="isSubmitting" x-cloak>
                  <span>Generating…</span>
                </span>
              </button>
            </div>
          </form>

          {/* HTMX Output Container for Generated Link Card */}
          <div id="share-result-container" class="mt-3"></div>

          {/* Post-Generation Action Bar (Close button only) */}
          <div class="modal-footer" x-show="isGenerated" x-cloak>
            <button
              type="button"
              class="btn btn-secondary"
              x-on:click="isOpen = false; reset();"
            >
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export interface ShareResultCardProps {
  shareUrl: string
  specTitle: string
  expiresAt: string | null
  alias?: string | null
}

export const ShareResultCard = ({ shareUrl, specTitle, expiresAt, alias }: ShareResultCardProps) => {
  const formattedDate = expiresAt ? new Date(expiresAt).toLocaleString() : 'Never (Permanent)'

  return (
    <div
      class="share-result-card"
      x-init="if (typeof isGenerated !== 'undefined') isGenerated = true"
      x-data={`{ copied: false, copy() { navigator.clipboard.writeText('${shareUrl}'); this.copied = true; setTimeout(() => this.copied = false, 2000); } }`}
    >
      <div class="share-result-header">
        <span class="share-result-title">
          <IconCheck width={14} height={14} class="text-success" />
          <span>Public Link Ready</span>
        </span>
        <span class="badge badge-subtle share-result-badge" title={specTitle}>
          {specTitle}
        </span>
      </div>

      <div class="share-link-box">
        <input
          type="text"
          readonly
          value={shareUrl}
          class="input font-mono share-link-input"
          x-on:click="$el.select()"
        />
        <button
          type="button"
          class="btn btn-primary btn-sm"
          x-on:click="copy()"
          title="Copy to clipboard"
        >
          <span x-show="!copied" class="flex-center-gap">
            <IconCopy width={13} height={13} />
            <span>Copy</span>
          </span>
          <span x-show="copied" x-cloak class="flex-center-gap">
            <IconCheck width={13} height={13} />
            <span>Copied!</span>
          </span>
        </button>
      </div>

      <div class="share-result-footer">
        <span class="text-muted font-xs">
          Expiration: <strong>{formattedDate}</strong>
        </span>
        <a href={shareUrl} target="_blank" rel="noopener noreferrer" class="btn-link-sm">
          <span>Open Link &rarr;</span>
        </a>
      </div>
    </div>
  )
}

