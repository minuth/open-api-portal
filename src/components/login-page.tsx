import { jsx } from 'hono/jsx'
import { IconLogo, IconLock, IconUser } from './icons'

export interface LoginPageProps {
  error?: string
}

export function LoginPage({ error }: LoginPageProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sign In - Open API Portal</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" href="/favicon.ico" />
        <script src="/public/js/app-init.js"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/public/css/main.css" />
      </head>
      <body>
        <div class="login-container">
          <div class="login-card">
            <div class="login-header">
              <IconLogo width={40} height={40} class="login-logo-icon" />
              <h1 class="login-title">Open API Portal</h1>
              <p class="login-subtitle">Sign in to access your API specifications</p>
            </div>

            {error && (
              <div class="alert-error login-alert" role="alert">
                {error}
              </div>
            )}

            <form action="/api/login" method="post" class="login-form">
              <div class="form-group">
                <label class="form-label" for="username">
                  Username
                </label>
                <div class="input-with-icon">
                  <IconUser width={16} height={16} class="input-icon" />
                  <input
                    id="username"
                    name="username"
                    type="text"
                    class="form-input"
                    placeholder="Enter username"
                    required
                    autocomplete="username"
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="password">
                  Password
                </label>
                <div class="input-with-icon">
                  <IconLock width={16} height={16} class="input-icon" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    class="form-input"
                    placeholder="Enter password"
                    required
                    autocomplete="current-password"
                  />
                </div>
              </div>

              <button type="submit" class="btn btn-primary login-btn">
                Sign In
              </button>
            </form>

            <div class="login-footer">
              Default seed credentials: <code class="code-pill">admin</code> / <code class="code-pill">admin123</code>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
