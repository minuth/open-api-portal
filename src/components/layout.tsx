import { jsx } from 'hono/jsx'
import { GitTokenRecord, UserRecord } from '../db/schema'
import { OpenApiDocument, SpecSummary } from '../types/openapi'
import { Header } from './header'
import { UploadModal } from './upload-modal'
import { TokenModal } from './token-modal'
import { ErrorDialog } from './error-dialog'
import { AuthModal } from './auth-modal'
import { ShareModal } from './share-modal'

export interface LayoutProps {
  title?: string
  activeSpecId?: string
  activeSpecTitle?: string
  activeSpecVersion?: string
  tokens?: GitTokenRecord[]
  user?: UserRecord | null
  allUsers?: UserRecord[]
  spec?: OpenApiDocument
  allSpecs?: SpecSummary[]
  isSharedView?: boolean
  shareExpiresAt?: string | null
  shareToken?: string
  allowSandboxUpload?: boolean
  children?: unknown
}

export const Layout = ({
  title = 'Open API Portal',
  activeSpecId,
  activeSpecTitle,
  activeSpecVersion,
  tokens = [],
  user,
  allUsers = [],
  spec,
  allSpecs = [],
  isSharedView = false,
  shareExpiresAt,
  shareToken,
  allowSandboxUpload = false,
  children
}: LayoutProps) => {
  const hasSecuritySchemes = Boolean(
    spec?.securitySchemes && Object.keys(spec.securitySchemes).length > 0
  )
  const canShare = user && (user.role === 'admin' || user.role === 'editor')

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" href="/favicon.ico" />
        <script src="/public/js/app-init.js"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href={`/public/css/main.css?v=${Date.now()}`} />
        <script src="/public/js/htmx.min.js"></script>
        <script src="/public/js/alpine.min.js" defer></script>
      </head>
      <body x-data="appState">
        <div class="app-container">
          <Header
            activeSpecId={activeSpecId || spec?.id}
            activeSpecTitle={activeSpecTitle}
            activeSpecVersion={activeSpecVersion}
            user={user}
            hasActiveSpec={Boolean(spec || activeSpecTitle)}
            hasSecuritySchemes={hasSecuritySchemes}
            isSharedView={isSharedView}
            shareExpiresAt={shareExpiresAt}
            allowSandboxUpload={allowSandboxUpload}
          />
          <main
            id="app-main"
            class="main-content"
            hx-headers={shareToken ? JSON.stringify({ 'x-share-token': shareToken }) : undefined}
          >
            {children}
          </main>
        </div>

        {/* Global Spec Auth Modal (Only rendered when specification declares security schemes) */}
        {hasSecuritySchemes && <AuthModal spec={spec} />}

        {/* Global Share Modal (Admin / Editor Only) */}
        {!isSharedView && canShare && (
          <ShareModal
            specs={allSpecs}
            activeSpecId={activeSpecId || spec?.id}
            activeSpecTitle={activeSpecTitle || spec?.info.title}
          />
        )}

        {/* Global Upload Spec Modal */}
        {(!isSharedView || allowSandboxUpload) && (
          <UploadModal
            tokens={tokens}
            user={
              isSharedView && allowSandboxUpload
                ? ({ id: user?.id || 'ext_viewer', role: 'viewer', username: 'External Viewer' } as UserRecord)
                : user
            }
          />
        )}

        {/* Global Token Modal */}
        {!isSharedView && <TokenModal tokens={tokens} />}

        {/* Global Error Dialog */}
        <ErrorDialog />
      </body>
    </html>
  )
}

