import { jsx } from 'hono/jsx'
import { GitTokenRecord, UserRecord } from '../db/schema'
import { OpenApiDocument } from '../types/openapi'
import { Header } from './header'
import { UploadModal } from './upload-modal'
import { TokenModal } from './token-modal'
import { ErrorDialog } from './error-dialog'
import { AuthModal } from './auth-modal'

export interface LayoutProps {
  title?: string
  activeSpecTitle?: string
  activeSpecVersion?: string
  tokens?: GitTokenRecord[]
  user?: UserRecord | null
  allUsers?: UserRecord[]
  spec?: OpenApiDocument
  children?: unknown
}

export const Layout = ({
  title = 'Open API Portal',
  activeSpecTitle,
  activeSpecVersion,
  tokens = [],
  user,
  allUsers = [],
  spec,
  children
}: LayoutProps) => {
  const hasSecuritySchemes = Boolean(
    spec?.securitySchemes && Object.keys(spec.securitySchemes).length > 0
  )

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
            activeSpecTitle={activeSpecTitle}
            activeSpecVersion={activeSpecVersion}
            user={user}
            hasActiveSpec={Boolean(spec || activeSpecTitle)}
            hasSecuritySchemes={hasSecuritySchemes}
          />
          <main id="app-main" class="main-content">
            {children}
          </main>
        </div>

        {/* Global Spec Auth Modal (Only rendered when specification declares security schemes) */}
        {hasSecuritySchemes && <AuthModal spec={spec} />}

        {/* Global Upload Spec Modal */}
        <UploadModal tokens={tokens} user={user} />

        {/* Global Token Modal */}
        <TokenModal tokens={tokens} />

        {/* Global Error Dialog */}
        <ErrorDialog />
      </body>
    </html>
  )
}

