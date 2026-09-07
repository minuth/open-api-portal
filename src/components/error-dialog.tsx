import { jsx } from 'hono/jsx'
import { IconClose } from './icons'

export const ErrorDialog = () => {
  return (
    <div
      class="modal-backdrop"
      x-show="openErrorDialog"
      x-cloak
      {...{
        'x-on:keydown.escape.window': 'openErrorDialog = false',
        'x-on:show-error-dialog.window': 'errorTitle = $event.detail.title; errorMessage = $event.detail.message; openErrorDialog = true'
      }}
    >
      <div
        class="modal-card modal-card-error"
        {...{
          'x-show': 'openErrorDialog',
          'x-transition:enter': 'transition ease-out duration-150',
          'x-transition:enter-start': 'opacity-0 transform scale-95',
          'x-transition:enter-end': 'opacity-100 transform scale-100'
        }}
      >
        <div class="modal-header">
          <h2 class="modal-title modal-title-error">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="error-title-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span x-text="errorTitle">Error</span>
          </h2>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="openErrorDialog = false"
            aria-label="Close dialog"
          >
            <IconClose width={14} height={14} />
          </button>
        </div>

        <div class="error-dialog-message" x-text="errorMessage"></div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            x-on:click="openErrorDialog = false"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
