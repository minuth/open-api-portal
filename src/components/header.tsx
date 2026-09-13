import { jsx } from 'hono/jsx'
import { IconSun, IconMoon, IconList, IconUpload, IconLogo, IconLogOut, IconShield, IconLock, IconSettings, IconShare, IconGitHub } from './icons'
import { UserRecord } from '../db/schema'

export interface HeaderProps {
  activeSpecId?: string
  activeSpecTitle?: string
  activeSpecVersion?: string
  user?: UserRecord | null
  hasActiveSpec?: boolean
  hasSecuritySchemes?: boolean
  isSharedView?: boolean
  shareExpiresAt?: string | null
  allowSandboxUpload?: boolean
}

export const Header = ({
  activeSpecId,
  activeSpecTitle,
  activeSpecVersion,
  user,
  hasActiveSpec,
  hasSecuritySchemes,
  isSharedView,
  shareExpiresAt,
  allowSandboxUpload
}: HeaderProps) => {
  const canShare = user && (user.role === 'admin' || user.role === 'editor')

  return (
    <header class="header">
      <div class="header-brand">
        <a href={isSharedView ? '#' : '/'} class="header-logo">
          <IconLogo width={20} height={20} />
          <span>Open API Portal</span>
        </a>
        <span class="header-brand-divider"></span>
        {activeSpecTitle ? (
          <span class="header-badge" title={`${activeSpecTitle} ${activeSpecVersion ? `v${activeSpecVersion}` : ''}`}>
            {activeSpecTitle} {activeSpecVersion && <span class="header-version-pill">v{activeSpecVersion}</span>}
          </span>
        ) : (
          <span class="header-badge">Centralized API Management</span>
        )}

        {isSharedView && (
          <span
            class="badge badge-warning"
            title={
              shareExpiresAt
                ? `This public link expires on ${new Date(shareExpiresAt).toLocaleString()}`
                : 'Permanent public link (Never expires)'
            }
          >
            <IconLock width={11} height={11} />
            <span>Shared View &bull; {shareExpiresAt ? `Expires ${new Date(shareExpiresAt).toLocaleDateString()}` : 'Never expires'}</span>
          </span>
        )}
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="btn btn-secondary btn-icon-only btn-sm"
          x-on:click="toggleTheme()"
          title="Toggle Day/Night theme"
        >
          <IconSun x-show="theme === 'dark'" />
          <IconMoon x-show="theme === 'light'" x-cloak />
        </button>

        <a
          href="https://github.com/minuth/open-api-portal"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-secondary btn-icon-only btn-sm"
          title="GitHub Repository"
          aria-label="GitHub Repository"
        >
          <IconGitHub width={14} height={14} />
        </a>

        {hasActiveSpec && hasSecuritySchemes && (
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click="$dispatch('open-auth-modal')"
            title="Configure global spec authorization"
          >
            <IconLock width={13} height={13} />
            <span>Authorize</span>
          </button>
        )}

        {/* Quick Share Link Trigger (Admin / Editor Only) */}
        {!isSharedView && hasActiveSpec && canShare && (
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            x-on:click={`$dispatch('open-share-modal', { specId: '${activeSpecId || ''}', specTitle: '${activeSpecTitle || ''}' })`}
            title="Create public share link"
          >
            <IconShare width={14} height={14} />
            <span>Share</span>
          </button>
        )}

        {!isSharedView && (
          <a href="/specs" class="btn btn-secondary btn-sm">
            <IconList width={14} height={14} />
            <span>Specs Catalog</span>
          </a>
        )}

        {!isSharedView && user && (
          <a href="/settings" class="btn btn-secondary btn-sm" title="Settings">
            <IconSettings width={14} height={14} />
            <span>Settings</span>
          </a>
        )}

        {!isSharedView ? (
          <button
            type="button"
            class="btn btn-primary btn-sm"
            x-on:click="openUploadModal = true"
          >
            <IconUpload width={14} height={14} />
            <span>{user?.role === 'viewer' ? 'Upload Sandbox Spec' : 'Upload Spec'}</span>
          </button>
        ) : allowSandboxUpload ? (
          <button
            type="button"
            class="btn btn-primary btn-sm"
            x-on:click="openUploadModal = true"
            title="Upload private Sandbox specification"
          >
            <IconUpload width={14} height={14} />
            <span>Upload Sandbox Spec</span>
          </button>
        ) : null}

        {!isSharedView && user && (
          <div class="user-avatar-pill">
            <span class="user-avatar-name">{user.username}</span>
            <span class={`role-badge role-badge-${user.role}`}>
              <IconShield width={10} height={10} /> {user.role.toUpperCase()}
            </span>
            <form action="/api/logout" method="post" class="logout-form">
              <button type="submit" class="btn-logout-icon" title="Sign Out">
                <IconLogOut width={13} height={13} />
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  )
}

