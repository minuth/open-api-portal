import { jsx } from 'hono/jsx'
import { IconSun, IconMoon, IconList, IconUpload, IconLogo, IconLogOut, IconShield, IconLock, IconSettings } from './icons'
import { UserRecord } from '../db/schema'

export interface HeaderProps {
  activeSpecTitle?: string
  activeSpecVersion?: string
  user?: UserRecord | null
  hasActiveSpec?: boolean
  hasSecuritySchemes?: boolean
}

export const Header = ({
  activeSpecTitle,
  activeSpecVersion,
  user,
  hasActiveSpec,
  hasSecuritySchemes
}: HeaderProps) => {
  return (
    <header class="header">
      <div class="header-brand">
        <a href="/" class="header-logo">
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

        <a href="/specs" class="btn btn-secondary btn-sm">
          <IconList width={14} height={14} />
          <span>Specs Catalog</span>
        </a>

        {user && (
          <a href="/settings" class="btn btn-secondary btn-sm" title="Settings">
            <IconSettings width={14} height={14} />
            <span>Settings</span>
          </a>
        )}

        <button
          type="button"
          class="btn btn-primary btn-sm"
          x-on:click="openUploadModal = true"
        >
          <IconUpload width={14} height={14} />
          <span>{user?.role === 'viewer' ? 'Upload Sandbox Spec' : 'Upload Spec'}</span>
        </button>

        {user && (
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

