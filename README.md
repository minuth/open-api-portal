# Open API Portal

Open API Portal is a centralized, lightweight platform for managing, exploring, and interactively testing OpenAPI specifications. It combines fast server-rendered documentation with an interactive API playground and comprehensive support for JOSE (JSON Object Signing and Encryption) workflows.

## Purpose

The portal provides a unified, secure API documentation and testing environment without client-side framework bloat. It allows developers and teams to:

- Upload and browse OpenAPI 3.0 and 3.1 YAML specifications with fast server-side rendering.
- Test endpoints directly through an interactive request builder with dynamic base URL selection, parameter management (path, query, headers), and request payload inspectors.
- Execute enterprise security workflows with native JOSE support: JWS attached and detached signatures, RFC 3230 payload digests, JWE encryption (RSA-OAEP, ECDH-ES+A256KW, AES-KW, Direct, Pure FLE), nested tokens, and response auto-decryption.
- Choose between persistent storage in the spec library or an ephemeral in-memory sandbox session.
- Synchronize specifications directly from Git repositories (GitHub, GitLab, self-hosted).

## Tech Stack

- **Backend Framework**: Hono (TypeScript) on Node.js
- **Templating & SSR**: Hono JSX (`hono/jsx`) for zero-bundle server-side HTML rendering
- **Frontend Interactivity**: HTMX (server-driven DOM partial updates) and Alpine.js (client-side state)
- **Styling**: Vanilla CSS adhering to a high-contrast dark theme (Linear / Vercel aesthetic)
- **Cryptography & Spec Engine**: `jose` (RFC 7515, RFC 7516, RFC 7518, RFC 7797) and `js-yaml`
- **Database & Persistence**: SQLite with Drizzle ORM for authentication, Git tokens, and spec metadata

## Getting Started

### Prerequisites

- Node.js 18+ or Bun

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open the portal at [http://localhost:3000](http://localhost:3000).

Default development login credentials: `admin` / `admin123`.

### Mock Verification Server

To run the companion mock API gateway for testing JOSE cryptographic flows:

```bash
npm run mock
```

The mock gateway runs on [http://localhost:4000](http://localhost:4000). To run the test suite:

```bash
npm run mock:test
```

## Documentation

- **PLAN.md**: Master architecture and feature specifications.
- **TASKS.md**: Implementation tracking and task breakdown.
- **.agents/AGENTS.md**: Engineering guidelines, SOLID architecture, and code conventions.

## License

MIT
