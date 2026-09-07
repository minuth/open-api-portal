import 'hono/jsx'

declare module 'hono/jsx' {
  namespace JSX {
    interface HTMLAttributes {
      // Allow HTMX & Alpine.js custom attributes in Hono JSX
      [key: string]: unknown
    }
  }
}
