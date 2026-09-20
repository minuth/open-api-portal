# Open API Portal

Open API Portal is a centralized platform for exploring, documenting, and interactively testing OpenAPI 3.0 and 3.1 specifications. It features a fast, server-rendered interface with an interactive request playground, native support for JSON Object Signing and Encryption (JOSE) enterprise workflows, and an embedded mock server with comprehensive real-world industry scenarios.

---

## Features

- **Interactive API Playground**: Execute requests directly with dynamic target server selection, path/query parameter inputs, and payload editors. Input controls strictly reflect the active OpenAPI specification.
- **Embedded Default Keys for JOSE**: Endpoints with `x-jose-security` can define default cryptographic keys directly in the specification using YAML anchors. Playground users can execute signing and encryption immediately without manually uploading PEM or JWK files.
- **Spec-Enforced Authentication**: Automatic handling of HTTP Bearer, API Key, Basic Auth, OAuth 2.0, and OpenID Connect schemes with live JWT claims decoding.
- **Native JOSE Extension (`x-jose-security`)**: Comprehensive declarative support for digital signatures (JWS), payload encryption (JWE), field-level encryption (Pure & Nested FLE), detached signatures, and nested envelopes (`cty: JWT`).
- **Specification Management & Git Sync**: Store specifications in persistent storage or ephemeral sandbox sessions, with automated sync from GitHub, GitLab, and self-hosted Git repositories.
- **Unified Companion Mock Server**: Embedded mock gateway that validates cryptographic signatures, decrypts JWE payloads, issues tokens, and simulates industry API patterns with zero external dependencies.
- **High-Contrast Dark Theme**: Fast, clean Linear/Vercel-inspired documentation interface with instant tag filtering, search, and response inspectors.

---

## Tech Stack

- **Runtime & Backend**: Node.js / Bun, TypeScript, Hono
- **Frontend**: Hono JSX, HTMX, Alpine.js, Vanilla CSS
- **Database**: SQLite with Drizzle ORM
- **Cryptography**: `jose` (RFC 7515, RFC 7516, RFC 7518, RFC 7797)

---

## JOSE OpenAPI Extension (`x-jose-security`)

The portal supports the `x-jose-security` OpenAPI extension, enabling declarative definition of cryptographic signing, encryption, and digest requirements directly within specifications at the root, path, or operation level.

### Hierarchy & Inheritance

1. **Operation Level**: `paths.<path>.<method>.x-jose-security` takes highest precedence.
2. **Path Level**: `paths.<path>.x-jose-security` applies to all operations under the path unless overridden.
3. **Root Level**: Root `x-jose-security` applies globally across all endpoints in the specification.

### Extension Schema Reference

```yaml
# Optional: Define reusable keys at root using YAML anchors
x-default-keys:
  rsaPrivateKey: &rsaPrivateKey |
    -----BEGIN PRIVATE KEY-----
    ...
    -----END PRIVATE KEY-----
  rsaPublicKey: &rsaPublicKey |
    -----BEGIN PUBLIC KEY-----
    ...
    -----END PUBLIC KEY-----

x-jose-security:
  enabled: true                  # Set to false to disable JOSE for this operation
  mode: jws | jwe | both         # Cryptographic operation mode

  # Top-level default key shortcuts (optional)
  defaultKey: *rsaPrivateKey     # Fallback key text for single-key operations
  defaultSigningKey: *rsaPrivateKey
  defaultEncryptionKey: *rsaPublicKey

  # Signature configuration (mode: jws or both)
  sign:
    alg: string                  # Signing algorithm (RS256, ES256, PS256, HS256, EdDSA)
    kid: string                  # Key ID hint (optional)
    placement: header | body     # Signature location (default: header)
    headerName: string           # Header name when placement is header (default: X-Signature)
    detached: boolean            # Generate detached signature (header..signature)
    b64: boolean                 # RFC 7797 unencoded payload control (default: true)
    crit: string[]               # Critical protected headers list (RFC 7515 §4.1.11)
    customHeaders: object        # Additional protected header parameters (e.g. FAPI claims)
    includeIat: boolean          # Inject 'iat' timestamp into protected header
    includeJti: boolean          # Inject 'jti' UUID nonce into protected header
    x5t: boolean                 # Attach 'x5t#S256' certificate thumbprint
    x5c: boolean                 # Embed X.509 certificate chain
    digestInPayload: boolean     # Inject body digest claim into JWS payload claims
    digestClaimName: string      # Payload digest claim name (default: digest)
    digestAlgorithm: string      # Digest algorithm: SHA-256 | SHA-384 | SHA-512 (default: SHA-256)
    claims: object               # Static or typed payload claims
    defaultKey: *rsaPrivateKey   # Embedded default private/secret key text (PEM, JWK, or raw secret)
    defaultPassphrase: string    # Optional passphrase for encrypted private keys

  # Encryption configuration (mode: jwe or both)
  encrypt:
    alg: string                  # Key wrap/agreement algorithm (RSA-OAEP-256, ECDH-ES+A256KW, A256KW, dir)
    enc: string                  # Content encryption algorithm (A256GCM, A128CBC-HS256)
    kid: string                  # Recipient Key ID hint (optional)
    placement: body | header | field  # JWE location (default: body)
    headerName: string           # Header name when placement is header (default: X-Encrypted-Payload)
    targetField: string          # Target JSON property for Field-Level Encryption (default: encData)
    fields: string[]             # Sensitive payload properties to encrypt into targetField
    cty: string                  # Content type header (e.g. JWT for nested tokens)
    zip: DEF                     # Deflate payload compression (RFC 7516)
    crit: string[]               # Critical protected headers list
    customHeaders: object        # Additional protected header parameters
    claims: object               # Custom payload claims for encrypted JWTs
    defaultKey: *rsaPublicKey    # Embedded default recipient public/secret key text (PEM, JWK, or raw secret)

  # Digest & verification controls
  computeDigest: boolean         # Generate RFC 3230 Digest header (e.g. Digest: SHA-256=...)
  digestHeaderName: string       # Custom digest header name (default: Digest)
  digestAlgorithm: string        # SHA-256 | SHA-384 | SHA-512
  jwksUri: string                # Remote JWKS URL for automated public key discovery
  decryptResponse: boolean       # Automatically decrypt incoming JWE responses in the UI
  verifyResponse: boolean        # Automatically verify incoming JWS response signatures
```

### Supported Cryptographic Algorithms

| Category | Supported Algorithms |
| :--- | :--- |
| **JWS Signing (`sign.alg`)** | `RS256`, `RS384`, `RS512`, `ES256`, `ES384`, `ES512`, `PS256`, `PS384`, `PS512`, `HS256`, `HS384`, `HS512`, `EdDSA` |
| **JWE Key Management (`encrypt.alg`)** | `RSA-OAEP`, `RSA-OAEP-256`, `A128KW`, `A192KW`, `A256KW`, `dir`, `ECDH-ES`, `ECDH-ES+A128KW`, `ECDH-ES+A192KW`, `ECDH-ES+A256KW` |
| **JWE Content Encryption (`encrypt.enc`)** | `A128GCM`, `A192GCM`, `A256GCM`, `A128CBC-HS256`, `A192CBC-HS384`, `A256CBC-HS512` |
| **Payload Integrity (`digestAlgorithm`)** | `SHA-256`, `SHA-384`, `SHA-512` (RFC 3230 `Digest` and RFC 9530 `Content-Digest`) |

---

## Interactive Playground Default Keys & Zero-Setup Testing

When testing endpoints with `x-jose-security`:
1. **Automatic Pre-loading**: If the specification provides `defaultKey`, the playground pre-loads it on page load (`"Default key loaded (from spec)"`).
2. **Transparent Backend Fallback**: If a user does not select or upload a key, the backend proxy automatically uses the default key defined in the spec.
3. **One-Click Key Reset**: If a user clears an uploaded key, a **"Use Default Key"** button instantly restores the spec's default key.
4. **File Upload Precedence**: Users can upload custom `.pem`, `.der`, or `.jwk.json` files at any time; uploaded keys always take precedence over spec defaults.

---

## Specification Examples

### 1. Detached JWS Signature with Default EC Key & RFC 3230 Digest

Used in Open Banking, NextGenPSD2, and UK Open Banking specifications:

```yaml
paths:
  /api/v1/payments/instant-transfer:
    post:
      summary: Instant Corporate Transfer
      x-jose-security:
        mode: jws
        computeDigest: true
        digestAlgorithm: SHA-256
        sign:
          alg: ES256
          kid: partner-signer-2026
          headerName: X-Signature
          detached: true
          b64: false
          crit:
            - b64
          defaultKey: *ecPrivateKey
```

### 2. Compact JWE Payload with Elliptic Curve Key Agreement

Used for mobile device binding and secure client onboarding:

```yaml
paths:
  /api/v1/mobile/device-binding:
    post:
      summary: Register Secure Device Binding
      x-jose-security:
        mode: jwe
        encrypt:
          alg: ECDH-ES+A256KW
          enc: A256GCM
          kid: gateway-ec-recipient
          placement: body
          defaultKey: *ecPublicKey
```

### 3. Field-Level Encryption (Pure FLE)

Encrypts sensitive credit card payload properties into a designated `encData` field:

```yaml
paths:
  /api/v1/cards/tokenize:
    post:
      summary: Tokenize Payment Card
      x-jose-security:
        mode: jwe
        encrypt:
          alg: RSA-OAEP-256
          enc: A256GCM
          placement: field
          targetField: encData
          fields:
            - pan
            - cvv
            - expiryMonth
            - expiryYear
          defaultKey: *rsaPublicKey
```

### 4. Nested JOSE (Sign-Then-Encrypt with Dual Default Keys)

Combines sender authenticity and recipient confidentiality with dual keys (`cty: JWT`):

```yaml
paths:
  /api/v1/banking/wire-transfer:
    post:
      summary: High-Value Wire Transfer
      x-jose-security:
        mode: both
        sign:
          alg: RS256
          kid: partner-signer-2026
          defaultKey: *rsaPrivateKey
        encrypt:
          alg: RSA-OAEP-256
          enc: A256GCM
          kid: gateway-rsa-recipient
          cty: JWT
          placement: body
          defaultKey: *rsaPublicKey
```

---

## Mock Specifications

Set `ENABLE_MOCK_API=true` in your `.env` to enable the companion mock server and automatically synchronize sample specifications from `./mock-api-spec/` into `./storage/specs/`.

---

## Getting Started

### Prerequisites

- **Node.js**: v20.0.0 or higher (or **Bun** v1.0+)
- **npm**: v9.0.0 or higher

### Configuration (`.env`)

Copy `example.env` to `.env`:

```bash
cp example.env .env
```

Key environment variables:

```ini
PORT=3000
DATABASE_PATH=./storage/portal.db
ENCRYPTION_SECRET=open-api-portal-secret-key-2026-secure-32byte!

# Initial Admin Credentials
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=admin123

# Companion Mock Server (runs on same unified port and auto-syncs mock-api-spec/)
ENABLE_MOCK_API=true
```

### Installation & Run

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server (with mock server enabled):
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000). Default credentials: `admin` / `admin123`.

---

## License

MIT
