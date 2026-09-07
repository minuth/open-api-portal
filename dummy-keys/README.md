# Dummy Test Keys for Open API Portal

These keys are provided for local development and testing with the `openapi-jose-demo.yaml` specification.

---

### Which Key to Use in the Playground:

| Endpoint in `openapi-jose-demo.yaml` | JOSE Mode & Algorithm | Recommended File to Upload |
| :--- | :--- | :--- |
| **POST /api/v1/payments/create** | JWS (RS256 Header) | `rsa-private.pem` or `rsa-private.der` or `rsa-private.jwk.json` |
| **POST /api/v1/payments/instant-transfer** | JWS (ES256 Detached + Digest) | `ec-private.pem` or `ec-private.der` or `ec-private.jwk.json` |
| **POST /api/v1/oauth2/par** | JWS (PS256 Body Token) | `rsa-private.pem` or `rsa-private.jwk.json` |
| **POST /api/v1/webhooks/incoming-settlement** | JWS (HS256 Symmetric) | `symmetric-key.jwk.json` or `symmetric-secret.txt` |
| **POST /api/v1/compliance/eidas-report** | JWS (ES256 + x5t/x5c) | `ec-private.pem` or `ec-private.jwk.json` |
| **POST /api/v1/cards/tokenize** | JWE (RSA-OAEP-256 Body) | `rsa-public.pem` or `rsa-public.der` or `rsa-public.jwk.json` |
| **POST /api/v1/mobile/device-binding** | JWE (ECDH-ES+A256KW Body) | `ec-public.pem` or `ec-public.der` |
| **POST /api/v1/vault/symmetric-secret** | JWE (dir + A256GCM Direct) | `symmetric-key.jwk.json` or `symmetric-secret.txt` |
| **POST /api/v1/batch/clearing-file** | JWE (A256KW + A128CBC-HS256) | `symmetric-key.jwk.json` or `symmetric-secret.txt` |
| **POST /api/v1/sessions/exchange** | JWE (RSA-OAEP-256 Header) | `rsa-public.pem` or `rsa-public.jwk.json` |
| **POST /api/v1/checkout/direct-charge** | JWE (Pure FLE into encData) | `rsa-public.pem` or `rsa-public.jwk.json` |
| **POST /api/v1/banking/wire-transfer** | Both (Nested Sign-Then-Encrypt) | **Signing Key**: `rsa-private.pem` / **Encryption Key**: `rsa-public.pem` |
| **POST /api/v1/cards/verify-pin** | Both (FLE + Outer JWS Signature) | **Signing Key**: `rsa-private.pem` / **Encryption Key**: `rsa-public.pem` |
| **POST /api/v1/cards/update-credentials** | Both (Nested FLE inside encData) | **Signing Key**: `rsa-private.pem` / **Encryption Key**: `rsa-public.pem` |
| **POST /api/v1/banking/account-statement** | JWS + Response Auto-Decrypt/Verify | `ec-private.pem` (or `ec-private.jwk.json`) |

---

### File Inventory:

* **RSA 2048-bit**:
  * `rsa-private.pem`: PKCS#8 PEM private key (RS256 / PS256 signing, JWE decryption).
  * `rsa-public.pem`: SPKI PEM public key (RSA-OAEP-256 encryption, JWS verification).
  * `rsa-private.der`: Binary DER encoded private key.
  * `rsa-public.der`: Binary DER encoded public key.
  * `rsa-private.jwk.json`: Full RSA private key in RFC 7517 JWK format.
  * `rsa-public.jwk.json`: Public RSA key in RFC 7517 JWK format.
* **ECDSA P-256**:
  * `ec-private.pem`: PKCS#8 PEM private key (ES256 signing).
  * `ec-public.pem`: SPKI PEM public key (ECDH-ES key agreement, ES256 verification).
  * `ec-private.der`: Binary DER encoded private key.
  * `ec-public.der`: Binary DER encoded public key.
  * `ec-private.jwk.json`: Full ECDSA private key in JWK format.
* **Symmetric (256-bit)**:
  * `symmetric-key.jwk.json`: RFC 7517 `kty: "oct"` JWK (HS256, dir, A256KW).
  * `symmetric-secret.txt`: Hex string secret (HS256, dir, A256KW).
