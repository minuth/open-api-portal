import { jsx } from 'hono/jsx'
import { GitTokenRecord, UserRecord } from '../db/schema'
import { Header } from './header'
import { UploadModal } from './upload-modal'
import { TokenModal } from './token-modal'
import { InviteModal } from './invite-modal'
import { ErrorDialog } from './error-dialog'

export interface LayoutProps {
  title?: string
  activeSpecTitle?: string
  activeSpecVersion?: string
  tokens?: GitTokenRecord[]
  user?: UserRecord | null
  allUsers?: UserRecord[]
  children?: unknown
}

export const Layout = ({
  title = 'Open API Portal',
  activeSpecTitle,
  activeSpecVersion,
  tokens = [],
  user,
  allUsers = [],
  children
}: LayoutProps) => {
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
        <link rel="stylesheet" href="/public/css/main.css?v=5" />
        <script src="/public/js/htmx.min.js"></script>
        <script src="/public/js/alpine.min.js" defer></script>
      </head>
      <body x-data="appState">
        <div class="app-container">
          <Header
            activeSpecTitle={activeSpecTitle}
            activeSpecVersion={activeSpecVersion}
            user={user}
          />
          <main id="app-main" class="main-content">
            {children}
          </main>
        </div>

        {/* Global Upload Spec Modal */}
        <UploadModal tokens={tokens} user={user} />

        {/* Global Token Modal */}
        <TokenModal tokens={tokens} />

        {/* Global Invite User Modal (Admin Only) */}
        {user?.role === 'admin' && <InviteModal users={allUsers} />}

        {/* Global Error Dialog */}
        <ErrorDialog />
      </body>
    </html>
  )
}

