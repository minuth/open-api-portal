import { jsx } from 'hono/jsx'
import { IconDocument, IconUpload } from './icons'

export interface EmptyStateProps {
  title?: string
  subtitle?: string
  buttonText?: string
  showUpload?: boolean
}

export const EmptyState = ({
  title = 'Welcome to Open API Portal',
  subtitle = 'No OpenAPI specifications loaded yet. Upload a .yaml file to get started.',
  buttonText = 'Upload Specification',
  showUpload = true
}: EmptyStateProps) => {
  return (
    <div class="welcome-center">
      {/* Icon */}
      <div class="welcome-icon">
        <IconDocument width={32} height={32} />
      </div>

      <h1 class="welcome-title">{title}</h1>
      <p class="welcome-subtitle">{subtitle}</p>

      {showUpload && (
        <button
          type="button"
          class="btn btn-primary"
          x-on:click="openUploadModal = true"
        >
          <IconUpload />
          {buttonText}
        </button>
      )}

      {!showUpload && (
        <a href="/" class="btn btn-secondary">
          Go to Home
        </a>
      )}
    </div>
  )
}
