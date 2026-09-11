# Agent Coding Guidelines: Open API Portal

These guidelines dictate coding conventions, architectural boundaries, and software design standards for all AI agents and developers working in this codebase.

---

## 1. Core Architecture & Tech Stack Rules

### Tech Stack Roles
* **Backend**: **Hono (TypeScript)** running on Node.js / Bun.
* **Templating & HTML SSR**: **Hono JSX** (`hono/jsx`).
  * ⚠️ **CRITICAL**: Do NOT import React or `react-dom`. Hono JSX compiles to pure server-side HTML strings.
* **Server Interactivity**: **HTMX** (`htmx.min.js`).
  * Use HTMX attributes (`hx-post`, `hx-get`, `hx-target`, `hx-swap`, `hx-indicator`) for all AJAX server requests and DOM partial swaps.
* **Client Micro-State**: **Alpine.js** (`alpine.min.js`).
  * Use Alpine.js (`x-data`, `x-show`, `x-model`, `@click`) strictly for instant client-only DOM manipulations (modals, dynamic key-value rows, collapsible JSON, tooltips). Do NOT make server fetch calls in Alpine.js scripts.
* **Styling**: Vanilla CSS adhering to a minimal, high-contrast dark theme (Linear/Vercel design style).

### 📦 Dependency & Library Policy
* **Always Use Latest Stable Libraries**: All AI agents and developers MUST always target, install, and use the latest stable versions of all project dependencies (`hono`, `@hono/node-server`, `js-yaml`, `typescript`, `tsx`, `@types/*`).
* **No Legacy or Deprecated Packages**: Never introduce outdated APIs or legacy syntax. Always check and use current framework standards.
* **Fresh Vendored Scripts**: Keep vendored client scripts in `public/js/` (`htmx.min.js`, `alpine.min.js`) updated to their latest stable releases.

---

## 2. SOLID Design Principles (Mandatory)

### 2.1 Single Responsibility Principle (SRP)
* **Controllers vs. Services**: Hono routes in `src/routes/` are strictly controllers. They must ONLY handle parameter parsing, invoke domain services, and return JSX components. They must **never** perform file I/O, YAML parsing, or HTTP proxying directly.
* **Service Responsibility**:
  * `SpecParserService`: Strictly parses and validates OpenAPI YAML specifications.
  * `StorageService`: Strictly handles local storage file persistence in `./storage/specs/`.
  * `ApiExecutorService`: Strictly executes outgoing HTTP proxy requests.
* **UI Components**: Components in `src/components/` must be pure presenter functions that transform props into HTML JSX.

### 2.2 Open/Closed Principle (OCP)
* **Storage Abstraction**: Always depend on the `IStorageProvider` interface (`saveSpec`, `getSpec`, `listSpecs`). Adding a new storage strategy (e.g. S3 or database) must be done by adding a new provider implementation without modifying existing Hono routes.
* **Parser Abstraction**: Depend on `ISpecParser` so future spec formats (OpenAPI 3.1, Postman collections) can be introduced without breaking the UI renderer.

### 2.3 Liskov Substitution Principle (LSP)
* Both `LocalStorageProvider` (`mode=save`) and `MemoryStorageProvider` (`mode=view`) must implement `IStorageProvider` and be fully interchangeable in service calls without breaking runtime guarantees.

### 2.4 Interface Segregation Principle (ISP)
* Prefer small, narrow, domain-focused interfaces rather than monolithic types:
  * `ISpecReader` (for reading specs).
  * `ISpecWriter` (for writing/deleting specs).
  * `IProxyDispatcher` (for executing target requests).

### 2.5 Dependency Inversion Principle (DIP)
* High-level controllers and routes must depend on interface abstractions, not concrete class implementations.
* Inject services via constructor injection or factory initialization helpers to facilitate clean unit testing and mocking.

---

## 3. Clean Code & Implementation Standards

### 3.1 Naming & Function Structure
* **Meaningful Naming**: Use intent-revealing names (`parseOpenApiYaml`, `targetBaseUrl`, `storageService`). Avoid vague names like `data`, `item`, `res`, `temp`.
* **Short, Single-Purpose Functions**: Keep functions under 30 lines. Extract complex logic, YAML transformations, and parameter string parsing into pure helper functions.

### 3.2 TypeScript Rigor
* **Strict Mode**: Maintain `"strict": true` in `tsconfig.json`.
* **Zero `any`**: Do not use `any`. Define explicit TypeScript interfaces/types in `src/types/openapi.ts`.
* **Return Types**: Specify explicit return types for all public service methods and Hono JSX component functions.

### 3.3 Error Handling Policy
* **Domain Errors**: Use explicit domain error classes (`InvalidSpecError`, `StorageError`, `ProxyTimeoutError`).
* **No Silent Swallowing**: Never wrap code in empty `catch` blocks or return `null` silently.
* **HTMX Error Partials**: Catch errors in Hono controllers and render human-readable alert partials (`<div class="alert-error">...</div>`) so HTMX can display them to the user cleanly.

### 3.4 DRY (Don't Repeat Yourself)
* **Component Reuse**: Reuse common UI elements (`Header`, `MethodBadge`, `RequestInputRow`, `AlertBox`).
* **Centralized Logic**: Centralize header building, query string serialization, and latency calculation helpers.

### 3.5 File & Directory Naming Conventions (Strict Kebab-Case)
* **Kebab-Case File Names**: All source code files, components, services, routes, types, and styles MUST use `kebab-case` file naming (`spec-parser.ts`, `storage-service.ts`, `api-executor.ts`, `upload-modal.tsx`, `spec-sidebar.tsx`, `spec-detail.tsx`, `request-panel.tsx`, `response-panel.tsx`, `method-badge.tsx`, `alert-box.tsx`, `layout.tsx`, `header.tsx`).
* **No `camelCase` or `PascalCase` file names**: Never name files with `camelCase` or `PascalCase` (e.g. use `spec-parser.ts` instead of `specParser.ts`).

### 3.6 No Inline Styles Policy (Mandatory Vanilla CSS)
* **Zero Inline Styles**: Do NOT use inline `style="..."` attributes in JSX component files or Hono route controllers.
* **Centralized Design System**: Define all component classes, layout helpers, and state modifiers inside `public/css/main.css` utilizing CSS custom properties (`--bg-base`, `--bg-card`, `--text-main`, `--text-muted`, `--border-color`, etc.).

### 3.7 Module Import Conventions (Extensionless Imports)
* **Omit Extensions**: Omit file extensions in TypeScript relative imports (e.g. `import { UploadModal } from './upload-modal'`).
* **Bundler Module Resolution**: Maintain `"moduleResolution": "bundler"` in `tsconfig.json`.

### 3.8 UI Design Principles: Strict Focus on Minimalism (Linear / Vercel Aesthetic)
* **Strict Minimalist Focus & Zero Redundancy (Mandatory)**:
  * **No Box-in-Box Nesting**: Never stack multiple bordered containers or card frames for closely related items. Merge fragmented sub-boxes (e.g., scheme headers, standalone checkbox bars, and credential fields) into a single cohesive, compact card or clean form groups.
  * **Zero Label & Target Duplication**: Display transmission details, headers, or scheme hints at most ONCE. Never repeat target strings across headers, tags, hints, and preview blocks (e.g., do NOT show `Header (Authorization: Bearer <token>)` in three separate places).
  * **Integrated Actions over Standalone Bars**: Never create isolated 1-line bordered boxes for single checkboxes or toggles (e.g., "Send unauthenticated"). Integrate secondary controls directly into the section header bar or inline with field labels.
  * **Spec-Driven Simplicity**: Only render UI sections for schemes and properties explicitly declared in the active specification. Omit all inapplicable categories completely (e.g., never display Basic Auth if the spec only defines Bearer/API Key).
  * **Compact Footprint & Direct Copy**: Keep modals and panels compact (`width: 460px–500px`), avoiding excessive vertical sprawl. Use concise action labels ("Save", "Cancel", "Clear") over verbose phrases ("Save & Authorize", "Clear Credentials").
* **High-Contrast Dark Theme & Precision Typography**: Adhere strictly to a clean, modern Linear/Vercel design system. Use Geist sans-serif for UI labels and Geist Mono for code, HTTP methods, and tokens.
* **No Emoji Placeholders for Structural UI**: Never use raw OS emojis (`🔒`, `⚙`, `🗑`) as primary icons or badges in structural UI layouts. Always use clean, scalable SVG components defined in `src/components/icons.tsx` (`<IconLock />`, `<IconPencil />`, `<IconTrash />`).
* **Visual Hierarchy & Spacing Rigor (Mandatory)**:
  * **Generous Page Container Boundaries**: Page containers must maintain generous outer padding (minimum 32px top/bottom, 24px horizontal: `padding: var(--sp-8) var(--sp-6) var(--sp-10) var(--sp-6);`) so headers and cards never collide with or hug the top viewport edge.
  * **Header Directness & Zero Filler Subtitles**: Omit redundant, generic filler paragraphs under self-explanatory section/page titles (e.g. never place "Manage your account credentials, personal access tokens, and portal configuration." under "Settings"). Title and clean tab navigation speak for themselves.
  * **Form Action Button Spacing**: Action buttons (`Save`, `Cancel`, `Create`, `Update`) must always reside in a dedicated flex container (`.settings-form-actions`) with explicit horizontal gap (`8px`–`12px`) and top breathing room (`margin-top: 12px; padding-top: 8px;`). Never allow action buttons to sit flush against container dividers or card borders.
  * **Drawer & Collapsible Spacing**: Embedded drawers and collapsible forms must maintain uniform internal padding (`24px` / `var(--sp-6)`). When open, they must have clean visual demarcation from adjacent elements.
  * **Empty State Dignity**: Never render empty list notifications as raw, unpadded 1-line text pressed against card borders. Always use dedicated empty-state containers (`.settings-empty-state`) with generous vertical padding (`32px`–`40px`), centered alignment, and muted typography. When an "Add" form drawer is actively open, hide the redundant empty state notice beneath it to prevent visual fragmentation.
  * **Enforce Zero Inline Styles**: Never use inline `style="..."` for text alignment, margins, or padding. Always use utility classes (`.text-right`, `.font-sm`).
  * Enforce clear horizontal spacing (8px–12px) between icons, text labels, and status badges.
  * Apply `min-width: 0`, `flex: 1`, and `text-overflow: ellipsis` on text containers so long labels truncate gracefully without squeezing adjacent tags or action buttons.
* **Strictly Identical Button Heights Across Variants & Colors (Mandatory)**:
  * **Locked Button Heights**: All buttons must have explicit, locked heights and `line-height: 1; box-sizing: border-box;` (`32px` for `.btn`, `28px` for `.btn-sm`, `24px` for `.btn-xs`). Buttons must NEVER rely solely on vertical padding to determine their height.
  * **White vs. Dark Button Parity**: White primary buttons (`.btn-primary`) and dark/black secondary buttons (`.btn-secondary`) must share the exact same height, font-weight (`500`), 1px border width, and vertical alignment so the white button is never taller or larger than the dark button.
  * **Internal Label Normalization**: Button text and icons must use `display: inline-flex; align-items: center; line-height: 1;` (wrapped in `<span>`) to eliminate inline line-box variances between raw text nodes and elements.
  * Use subtle ghost/border button styles with smooth CSS hover transitions (`transition: background-color 0.12s, border-color 0.12s`).
* **Subtle Translucent Badges**:
  * Style status and provider tags (GitHub, GitLab, Local, Sandbox) as compact, mono-spaced pills (`font-size: 0.68rem; padding: 0.15rem 0.5rem`).
  * Use subtle translucent backgrounds (`rgba(...)`) and matching 20% opacity borders instead of solid block colors.

---

## 4. Directory Structure Guidelines

```
src/
├── index.ts                # Hono server initialization & static route mounting
├── routes/                 # Hono controllers (HTTP input -> Service -> JSX Output)
├── components/             # Pure Hono JSX presenter components
├── services/               # Core domain business logic & SOLID interfaces
└── types/                  # Typed OpenAPI & domain interfaces
storage/
└── specs/                  # Local YAML spec storage
```
