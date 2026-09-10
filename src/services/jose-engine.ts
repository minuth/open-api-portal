import * as crypto from 'node:crypto'
import * as jose from 'jose'
import {
  IJoseEngine,
  JoseSignatureConfig,
  JoseEncryptionConfig,
  JoseSecurityExtension,
  EphemeralKeyInput,
  JoseTransformResult
} from '../types/jose'
import { JoseCryptoError } from '../types/errors'

export class JoseEngineService implements IJoseEngine {
  /**
   * Signs payload into a compact (or detached) JWS token using in-memory key
   */
  public async signPayload(
    payload: string,
    config: JoseSignatureConfig,
    key: EphemeralKeyInput
  ): Promise<string> {
    try {
      const privateKey = await this.importSigningKey(key.keyContent, config.alg, key.passphrase)
      const encoder = new TextEncoder()
      const payloadBytes = encoder.encode(payload)

      // Resolve effective kid: config.kid > key.kid > undefined
      const effectiveKid = config.kid?.trim() || key.kid?.trim() || undefined
      const x5tThumbprint = (config.x5t || key.certificateContent)
        ? this.extractCertThumbprint(key.certificateContent || key.keyContent)
        : undefined
      const certChain = (config.x5c || key.certificateContent)
        ? this.extractCertChain(key.certificateContent || key.keyContent)
        : undefined

      const protectedHeader: Record<string, unknown> = {
        alg: config.alg,
        ...(effectiveKid ? { kid: effectiveKid } : {}),
        ...(x5tThumbprint ? { 'x5t#S256': x5tThumbprint } : {}),
        ...(certChain ? { x5c: certChain } : {}),
        ...(config.includeIat ? { iat: Math.floor(Date.now() / 1000) } : {}),
        ...(config.includeJti ? { jti: crypto.randomUUID() } : {}),
        ...(typeof config.b64 === 'boolean' ? { b64: config.b64 } : {}),
        ...(config.crit && config.crit.length > 0 ? { crit: config.crit } : {}),
        ...(config.customHeaders || {})
      }

      const signer = new jose.CompactSign(payloadBytes).setProtectedHeader(protectedHeader as jose.CompactJWSHeaderParameters)
      const signOptions = config.crit && config.crit.length > 0
        ? { crit: Object.fromEntries(config.crit.map(c => [c, true])) }
        : undefined
      const fullJws = await signer.sign(privateKey, signOptions)

      if (config.detached) {
        // Detached JWS replaces the payload section between dots with an empty string: header..signature
        const parts = fullJws.split('.')
        if (parts.length === 3) {
          return `${parts[0]}..${parts[2]}`
        }
      }

      return fullJws
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new JoseCryptoError(`Failed to sign payload with ${config.alg}: ${msg}`)
    }
  }

  /**
   * Encrypts payload into a compact JWE token using in-memory key
   */
  public async encryptPayload(
    payload: string,
    config: JoseEncryptionConfig,
    key: EphemeralKeyInput
  ): Promise<string> {
    try {
      const encryptionKey = await this.importEncryptionKey(key.keyContent, config.alg)
      const encoder = new TextEncoder()
      const payloadBytes = encoder.encode(payload)

      const effectiveKid = config.kid?.trim() || key.kid?.trim() || undefined
      const x5tThumbprint = (config.x5t || key.certificateContent)
        ? this.extractCertThumbprint(key.certificateContent || key.keyContent)
        : undefined
      const certChain = (config.x5c || key.certificateContent)
        ? this.extractCertChain(key.certificateContent || key.keyContent)
        : undefined

      const protectedHeader: Record<string, unknown> = {
        alg: config.alg,
        enc: config.enc,
        ...(effectiveKid ? { kid: effectiveKid } : {}),
        ...(config.cty ? { cty: config.cty } : {}),
        ...(config.zip ? { zip: config.zip } : {}),
        ...(x5tThumbprint ? { 'x5t#S256': x5tThumbprint } : {}),
        ...(certChain ? { x5c: certChain } : {}),
        ...(config.crit && config.crit.length > 0 ? { crit: config.crit } : {}),
        ...(config.customHeaders || {})
      }

      const encrypter = new jose.CompactEncrypt(payloadBytes).setProtectedHeader(protectedHeader as jose.CompactJWEHeaderParameters)
      return await encrypter.encrypt(encryptionKey)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new JoseCryptoError(`Failed to encrypt payload with ${config.alg}/${config.enc}: ${msg}`)
    }
  }

  /**
   * Orchestrates outgoing HTTP request transformations (JWS signing, JWE encryption, or both)
   */
  public async processOutgoingRequest(
    rawBody: string | undefined,
    headers: Record<string, string>,
    config: JoseSecurityExtension,
    key?: EphemeralKeyInput
  ): Promise<JoseTransformResult> {
    const updatedHeaders: Record<string, string> = { ...headers }
    let updatedBody = rawBody

    const hasKey = Boolean(key && (key.keyContent?.trim() || key.signingKeyContent?.trim() || key.encryptionKeyContent?.trim()))
    if (!config.enabled || !key || !hasKey) {
      return { headers: updatedHeaders, body: updatedBody }
    }

    const mode = config.mode || (config.sign && config.encrypt ? 'both' : config.encrypt ? 'jwe' : 'jws')
    const bodyToProcess = rawBody || ''

    const digestHdrName = config.digestHeaderName || 'Digest'
    const effectiveDigestAlg = config.digestAlgorithm || config.sign?.digestAlgorithm || 'SHA-256'
    const isDigestInPayload = Boolean(config.digestInPayload || config.sign?.digestInPayload)
    const digestClaimName = config.digestClaimName || config.sign?.digestClaimName || 'digest'

    let computedDigest: string | undefined
    if ((config.computeDigest || isDigestInPayload) && bodyToProcess) {
      computedDigest = this.computeDigestHeader(bodyToProcess, effectiveDigestAlg)
      if (config.computeDigest) {
        updatedHeaders[digestHdrName] = computedDigest
      }
    }

    if (mode === 'jws' && config.sign) {
      const placement = config.sign.placement || 'header'
      const headerName = config.sign.headerName || 'X-Signature'

      let payloadToSign = bodyToProcess
      let jwsClaims: Record<string, unknown> | undefined

      const effectiveSignClaims: Record<string, unknown> = {
        ...(config.claims || {}),
        ...(config.sign.claims || {})
      }
      const hasCustomClaims = Boolean(Object.keys(effectiveSignClaims).length > 0)
      if (placement === 'header' && (isDigestInPayload || hasCustomClaims)) {
        // JWS in Header: Build JWT claims set containing custom claims and body digest
        jwsClaims = {
          ...effectiveSignClaims,
          ...(isDigestInPayload && computedDigest ? { [digestClaimName]: computedDigest } : {}),
          ...(config.sign.includeIat ? { iat: Math.floor(Date.now() / 1000) } : {}),
          ...(config.sign.includeJti ? { jti: crypto.randomUUID() } : {})
        }
        payloadToSign = JSON.stringify(jwsClaims)
      } else if (placement === 'body' && (isDigestInPayload || hasCustomClaims)) {
        // JWS in Body: If body is valid JSON, inject claims and/or digest claim directly
        try {
          const bodyObj = JSON.parse(bodyToProcess) as Record<string, unknown>
          if (hasCustomClaims) {
            Object.assign(bodyObj, effectiveSignClaims)
          }
          if (isDigestInPayload && computedDigest) {
            bodyObj[digestClaimName] = computedDigest
          }
          payloadToSign = JSON.stringify(bodyObj, null, 2)
          jwsClaims = bodyObj
        } catch {
          // Keep original string if not valid JSON
        }
      }

      const jwsToken = await this.signPayload(payloadToSign, config.sign, key)

      if (placement === 'body') {
        updatedBody = jwsToken
        updatedHeaders['Content-Type'] = 'application/jose'
      } else {
        updatedHeaders[headerName] = jwsToken
      }

      return {
        headers: updatedHeaders,
        body: updatedBody,
        meta: {
          mode: 'jws',
          alg: config.sign.alg,
          kid: config.sign.kid || key.kid,
          tokenPreview: jwsToken.length > 50 ? `${jwsToken.substring(0, 47)}...` : jwsToken,
          placement,
          headerName: placement === 'header' ? headerName : undefined,
          crit: config.sign.crit,
          digest: computedDigest,
          digestHeaderName: config.computeDigest ? digestHdrName : undefined,
          payloadClaims: jwsClaims
        }
      }
    }

    if (mode === 'jwe' && config.encrypt) {
      const placement = config.encrypt.placement || 'body'
      const headerName = config.encrypt.headerName || 'X-Encrypted-Payload'

      // Field-Level Encryption (Pure FLE)
      if (placement === 'field') {
        const targetField = config.encrypt.targetField || 'encData'
        let rootObj: Record<string, unknown>
        try {
          rootObj = JSON.parse(bodyToProcess)
        } catch (err) {
          throw new JoseCryptoError(`Field-Level Encryption requires a valid JSON body: ${err instanceof Error ? err.message : String(err)}`)
        }

        const { sensitiveObj, encryptedFieldList } = this.extractFlePayload(rootObj, targetField, config.encrypt.fields)
        const hasEncClaims = Boolean(config.encrypt.claims && Object.keys(config.encrypt.claims).length > 0)
        const flePayload = hasEncClaims
          ? { ...config.encrypt.claims, ...sensitiveObj }
          : sensitiveObj
        const jweToken = await this.encryptPayload(JSON.stringify(flePayload), config.encrypt, key)
        rootObj[targetField] = jweToken
        updatedBody = JSON.stringify(rootObj, null, 2)
        updatedHeaders['Content-Type'] = 'application/json'

        if (config.computeDigest && updatedBody) {
          computedDigest = this.computeDigestHeader(updatedBody, effectiveDigestAlg)
          updatedHeaders[digestHdrName] = computedDigest
        }

        return {
          headers: updatedHeaders,
          body: updatedBody,
          meta: {
            mode: 'jwe',
            alg: config.encrypt.alg,
            enc: config.encrypt.enc,
            kid: config.encrypt.kid || key.kid,
            tokenPreview: jweToken.length > 50 ? `${jweToken.substring(0, 47)}...` : jweToken,
            placement: 'field',
            targetField,
            encryptedFields: encryptedFieldList,
            flePattern: 'pure',
            digest: computedDigest || updatedHeaders[digestHdrName],
            digestHeaderName: config.computeDigest ? digestHdrName : undefined,
            payloadClaims: hasEncClaims ? flePayload : undefined
          }
        }
      }

      let encPayloadStr = bodyToProcess
      const hasEncClaims = Boolean(config.encrypt.claims && Object.keys(config.encrypt.claims).length > 0)
      let jweToken = ''

      if (placement === 'header') {
        if (hasEncClaims && config.encrypt.claims) {
          encPayloadStr = JSON.stringify(config.encrypt.claims, null, 2)
        }
        jweToken = await this.encryptPayload(encPayloadStr, config.encrypt, key)
        updatedHeaders[headerName] = jweToken
        // Cleartext HTTP body remains intact in updatedBody for the target server
      } else {
        // placement === 'body'
        if (hasEncClaims && config.encrypt.claims) {
          try {
            const parsed = bodyToProcess ? JSON.parse(bodyToProcess) : {}
            encPayloadStr = JSON.stringify({ ...parsed, ...config.encrypt.claims }, null, 2)
          } catch {
            encPayloadStr = JSON.stringify(config.encrypt.claims, null, 2)
          }
        }
        jweToken = await this.encryptPayload(encPayloadStr, config.encrypt, key)
        updatedBody = jweToken
        updatedHeaders['Content-Type'] = 'application/jose'
      }

      return {
        headers: updatedHeaders,
        body: updatedBody,
        meta: {
          mode: 'jwe',
          alg: config.encrypt.alg,
          enc: config.encrypt.enc,
          kid: config.encrypt.kid || key.kid,
          tokenPreview: jweToken.length > 50 ? `${jweToken.substring(0, 47)}...` : jweToken,
          placement,
          headerName: placement === 'header' ? headerName : undefined,
          payloadClaims: hasEncClaims ? config.encrypt.claims : undefined,
          digest: computedDigest || updatedHeaders[digestHdrName],
          digestHeaderName: config.computeDigest ? digestHdrName : undefined
        }
      }
    }

    if (mode === 'both' && config.sign && config.encrypt) {
      // Resolve distinct signing key (Client Private Key) and encryption key (Recipient Public Key)
      const signingKeyInput: EphemeralKeyInput = {
        keyContent: key.signingKeyContent || key.keyContent,
        kid: key.signingKid || config.sign.kid || key.kid,
        passphrase: key.signingPassphrase || key.passphrase,
        certificateContent: key.certificateContent
      }

      const encryptionKeyInput: EphemeralKeyInput = {
        keyContent: key.encryptionKeyContent || key.keyContent,
        kid: key.encryptionKid || config.encrypt.kid || key.kid,
        certificateContent: key.certificateContent
      }

      // FLE with JWS
      if (config.encrypt.placement === 'field') {
        const targetField = config.encrypt.targetField || 'encData'
        let rootObj: Record<string, unknown>
        try {
          rootObj = JSON.parse(bodyToProcess)
        } catch (err) {
          throw new JoseCryptoError(`Field-Level Encryption requires a valid JSON body: ${err instanceof Error ? err.message : String(err)}`)
        }

        const { sensitiveObj, encryptedFieldList } = this.extractFlePayload(rootObj, targetField, config.encrypt.fields)

        // Pattern 2: Nested FLE (Sign sensitive data with JWS claims, then encrypt with cty: JWT inside targetField)
        if (config.sign.placement === 'field') {
          const effectiveSignClaims: Record<string, unknown> = {
            ...(config.claims || {}),
            ...(config.sign.claims || {})
          }
          const hasSignClaims = Boolean(Object.keys(effectiveSignClaims).length > 0)
          const sensitivePayload: Record<string, unknown> = {
            ...effectiveSignClaims,
            ...sensitiveObj
          }
          if (config.sign.includeIat && (!sensitivePayload.iat || typeof sensitivePayload.iat !== 'number')) {
            sensitivePayload.iat = Math.floor(Date.now() / 1000)
          }
          if (config.sign.includeJti && (!sensitivePayload.jti || typeof sensitivePayload.jti !== 'string')) {
            sensitivePayload.jti = crypto.randomUUID()
          }

          const innerJws = await this.signPayload(JSON.stringify(sensitivePayload), config.sign, signingKeyInput)
          const encConfig: JoseEncryptionConfig = {
            ...config.encrypt,
            cty: config.encrypt.cty || 'JWT'
          }
          const jweToken = await this.encryptPayload(innerJws, encConfig, encryptionKeyInput)
          rootObj[targetField] = jweToken
          updatedBody = JSON.stringify(rootObj, null, 2)
          updatedHeaders['Content-Type'] = 'application/json'

          if (config.computeDigest && updatedBody) {
            computedDigest = this.computeDigestHeader(updatedBody, effectiveDigestAlg)
            updatedHeaders[digestHdrName] = computedDigest
          }

          return {
            headers: updatedHeaders,
            body: updatedBody,
            meta: {
              mode: 'both',
              alg: `${config.sign.alg} -> ${config.encrypt.alg}`,
              enc: config.encrypt.enc,
              kid: signingKeyInput.kid || encryptionKeyInput.kid,
              tokenPreview: jweToken.length > 50 ? `${jweToken.substring(0, 47)}...` : jweToken,
              placement: 'field',
              targetField,
              encryptedFields: encryptedFieldList,
              flePattern: 'nested',
              cty: 'JWT',
              crit: config.sign.crit,
              digest: computedDigest || updatedHeaders[digestHdrName],
              digestHeaderName: config.computeDigest ? digestHdrName : undefined,
              payloadClaims: hasSignClaims || config.sign.includeIat || config.sign.includeJti ? sensitivePayload : undefined,
              encClaims: config.encrypt.claims
            }
          }
        }

        // Pattern 1: Outer Request Signature + FLE
        // 1. Encrypt sensitive fields (plus JWE claims if any) into targetField
        const hasEncClaims = Boolean(config.encrypt.claims && Object.keys(config.encrypt.claims).length > 0)
        const fleEncPayload = hasEncClaims
          ? { ...config.encrypt.claims, ...sensitiveObj }
          : sensitiveObj
        const jweToken = await this.encryptPayload(JSON.stringify(fleEncPayload), config.encrypt, encryptionKeyInput)
        rootObj[targetField] = jweToken
        updatedBody = JSON.stringify(rootObj, null, 2)
        updatedHeaders['Content-Type'] = 'application/json'

        // 2. Re-compute digest over the finalized outer body containing encrypted encData
        const effectiveSignClaims: Record<string, unknown> = {
          ...(config.claims || {}),
          ...(config.sign.claims || {})
        }
        const hasCustomClaims = Boolean(Object.keys(effectiveSignClaims).length > 0)
        const isDecoupled = Boolean(isDigestInPayload || hasCustomClaims)

        if ((config.computeDigest || isDecoupled) && updatedBody) {
          computedDigest = this.computeDigestHeader(updatedBody, effectiveDigestAlg)
          if (config.computeDigest) {
            updatedHeaders[digestHdrName] = computedDigest
          }
        }

        // 3. Sign: Decoupled Claims Mode vs Legacy Body Signing Mode
        let payloadToSign = updatedBody
        let jwsClaims: Record<string, unknown> | undefined

        if (isDecoupled) {
          // Decoupled Claims Mode: Build JWS payload from effective claims, computed digest, jti, iat, exp
          jwsClaims = {
            ...effectiveSignClaims
          }
          if (computedDigest) {
            jwsClaims[digestClaimName] = computedDigest
          }
          if (config.sign.includeIat && (!jwsClaims.iat || typeof jwsClaims.iat !== 'number')) {
            jwsClaims.iat = Math.floor(Date.now() / 1000)
          }
          if (config.sign.includeJti && (!jwsClaims.jti || typeof jwsClaims.jti !== 'string')) {
            jwsClaims.jti = crypto.randomUUID()
          }
          payloadToSign = JSON.stringify(jwsClaims)
        }

        // 4. Sign payload into header
        const headerName = config.sign.headerName || 'X-Signature'
        const jwsToken = await this.signPayload(payloadToSign, config.sign, signingKeyInput)
        updatedHeaders[headerName] = jwsToken

        return {
          headers: updatedHeaders,
          body: updatedBody,
          meta: {
            mode: 'both',
            alg: `${config.sign.alg} + ${config.encrypt.alg}`,
            enc: config.encrypt.enc,
            kid: signingKeyInput.kid || encryptionKeyInput.kid,
            tokenPreview: jwsToken.length > 50 ? `${jwsToken.substring(0, 47)}...` : jwsToken,
            placement: 'field',
            headerName,
            targetField,
            encryptedFields: encryptedFieldList,
            flePattern: 'outer-signature',
            crit: config.sign.crit,
            digest: computedDigest || updatedHeaders[digestHdrName],
            digestHeaderName: config.computeDigest ? digestHdrName : undefined,
            payloadClaims: jwsClaims,
            encClaims: config.encrypt.claims
          }
        }
      }

      // Standard Nested (Sign entire body with Client Private Key, then Encrypt with Bank Public Key)
      const effectiveSignClaims: Record<string, unknown> = {
        ...(config.claims || {}),
        ...(config.sign.claims || {})
      }
      const hasCustomClaims = Boolean(Object.keys(effectiveSignClaims).length > 0)

      if (config.sign.placement === 'header') {
        // Architecture: Full Body Encryption (JWE in body) + Request Signature (JWS in Header)
        // 1. Encrypt body (and any JWE claims) into JWE
        let bodyToEncrypt = bodyToProcess
        const hasEncClaims = Boolean(config.encrypt.claims && Object.keys(config.encrypt.claims).length > 0)
        if (hasEncClaims) {
          try {
            const bObj = bodyToProcess ? JSON.parse(bodyToProcess) as Record<string, unknown> : {}
            bodyToEncrypt = JSON.stringify({ ...bObj, ...config.encrypt.claims }, null, 2)
          } catch {
            bodyToEncrypt = JSON.stringify(config.encrypt.claims, null, 2)
          }
        }
        const encConfig: JoseEncryptionConfig = {
          ...config.encrypt,
          cty: config.encrypt.cty || (hasEncClaims ? 'JWT' : undefined)
        }
        const jweToken = await this.encryptPayload(bodyToEncrypt, encConfig, encryptionKeyInput)
        updatedBody = jweToken
        updatedHeaders['Content-Type'] = 'application/jose'

        // 2. Re-compute digest over the finalized encrypted body
        const isDecoupled = Boolean(isDigestInPayload || hasCustomClaims)
        if ((config.computeDigest || isDecoupled) && updatedBody) {
          computedDigest = this.computeDigestHeader(updatedBody, effectiveDigestAlg)
          if (config.computeDigest) {
            updatedHeaders[digestHdrName] = computedDigest
          }
        }

        // 3. Sign decoupled claims or body into header
        let payloadToSign = updatedBody
        let jwsClaims: Record<string, unknown> | undefined

        if (isDecoupled) {
          jwsClaims = {
            ...effectiveSignClaims
          }
          if (computedDigest) {
            jwsClaims[digestClaimName] = computedDigest
          }
          if (config.sign.includeIat && (!jwsClaims.iat || typeof jwsClaims.iat !== 'number')) {
            jwsClaims.iat = Math.floor(Date.now() / 1000)
          }
          if (config.sign.includeJti && (!jwsClaims.jti || typeof jwsClaims.jti !== 'string')) {
            jwsClaims.jti = crypto.randomUUID()
          }
          payloadToSign = JSON.stringify(jwsClaims)
        }

        const headerName = config.sign.headerName || 'X-Signature'
        const jwsToken = await this.signPayload(payloadToSign, config.sign, signingKeyInput)
        updatedHeaders[headerName] = jwsToken

        return {
          headers: updatedHeaders,
          body: updatedBody,
          meta: {
            mode: 'both',
            alg: `${config.sign.alg} + ${config.encrypt.alg}`,
            enc: config.encrypt.enc,
            kid: signingKeyInput.kid || encryptionKeyInput.kid,
            tokenPreview: jwsToken.length > 50 ? `${jwsToken.substring(0, 47)}...` : jwsToken,
            placement: 'header',
            headerName,
            crit: config.sign.crit,
            digest: computedDigest || updatedHeaders[digestHdrName],
            digestHeaderName: config.computeDigest ? digestHdrName : undefined,
            payloadClaims: jwsClaims,
            encClaims: config.encrypt.claims
          }
        }
      }

      // Architecture: Standard Nested (Sign entire body with Client Private Key, then Encrypt with Bank Public Key)
      let innerPayloadToSign = bodyToProcess
      let nestedSignClaims: Record<string, unknown> | undefined

      if (hasCustomClaims) {
        try {
          const bodyObj = bodyToProcess ? JSON.parse(bodyToProcess) as Record<string, unknown> : {}
          Object.assign(bodyObj, effectiveSignClaims)
          if (config.sign.includeIat && (!bodyObj.iat || typeof bodyObj.iat !== 'number')) {
            bodyObj.iat = Math.floor(Date.now() / 1000)
          }
          if (config.sign.includeJti && (!bodyObj.jti || typeof bodyObj.jti !== 'string')) {
            bodyObj.jti = crypto.randomUUID()
          }
          innerPayloadToSign = JSON.stringify(bodyObj, null, 2)
          nestedSignClaims = bodyObj
        } catch {
          nestedSignClaims = effectiveSignClaims
        }
      } else if (config.sign.includeIat || config.sign.includeJti) {
        try {
          const bodyObj = bodyToProcess ? JSON.parse(bodyToProcess) as Record<string, unknown> : {}
          if (config.sign.includeIat && !bodyObj.iat) {
            bodyObj.iat = Math.floor(Date.now() / 1000)
          }
          if (config.sign.includeJti && !bodyObj.jti) {
            bodyObj.jti = crypto.randomUUID()
          }
          innerPayloadToSign = JSON.stringify(bodyObj, null, 2)
          nestedSignClaims = bodyObj
        } catch {}
      }

      const jwsToken = await this.signPayload(innerPayloadToSign, config.sign, signingKeyInput)
      const encConfig: JoseEncryptionConfig = {
        ...config.encrypt,
        cty: config.encrypt.cty || 'JWT'
      }
      const jweToken = await this.encryptPayload(jwsToken, encConfig, encryptionKeyInput)

      updatedBody = jweToken
      updatedHeaders['Content-Type'] = 'application/jose'

      return {
        headers: updatedHeaders,
        body: updatedBody,
        meta: {
          mode: 'both',
          alg: `${config.sign.alg} -> ${config.encrypt.alg}`,
          enc: config.encrypt.enc,
          kid: signingKeyInput.kid || encryptionKeyInput.kid,
          tokenPreview: jweToken.length > 50 ? `${jweToken.substring(0, 47)}...` : jweToken,
          placement: 'body',
          cty: 'JWT',
          crit: config.sign.crit,
          digest: computedDigest || updatedHeaders[digestHdrName],
          digestHeaderName: config.computeDigest ? digestHdrName : undefined,
          payloadClaims: nestedSignClaims,
          encClaims: config.encrypt.claims
        }
      }
    }

    return { headers: updatedHeaders, body: updatedBody }
  }

  /**
   * Helper to extract sensitive fields from a root JSON object for Field-Level Encryption
   */
  private extractFlePayload(
    rootObj: Record<string, unknown>,
    targetField: string,
    fieldNames?: string[]
  ): { sensitiveObj: Record<string, unknown>; encryptedFieldList: string[] } {
    const sensitiveObj: Record<string, unknown> = {}
    const encryptedFieldList: string[] = []

    const nestedContainer =
      typeof rootObj[targetField] === 'object' && rootObj[targetField] !== null
        ? (rootObj[targetField] as Record<string, unknown>)
        : undefined

    if (Array.isArray(fieldNames) && fieldNames.length > 0) {
      for (const field of fieldNames) {
        // 1. Check if field is directly at root level
        if (field in rootObj) {
          sensitiveObj[field] = rootObj[field]
          encryptedFieldList.push(field)
          delete rootObj[field]
        }
        // 2. Check if field is inside targetField object (e.g. rootObj.encData.pin)
        else if (nestedContainer && field in nestedContainer) {
          sensitiveObj[field] = nestedContainer[field]
          encryptedFieldList.push(field)
          delete nestedContainer[field]
        }
      }
    }

    // 3. Fallback: If sensitiveObj is empty (or no specific fields configured) and nestedContainer has properties
    if (Object.keys(sensitiveObj).length === 0 && nestedContainer) {
      for (const [k, v] of Object.entries(nestedContainer)) {
        sensitiveObj[k] = v
        encryptedFieldList.push(k)
      }
    }

    return { sensitiveObj, encryptedFieldList }
  }

  /**
   * Computes RFC 3230 / RFC 5843 / RFC 9530 HTTP Digest header value (e.g. SHA-256=<base64-hash>)
   */
  public computeDigestHeader(body: string, algorithm = 'SHA-256'): string {
    let hashAlg = 'sha256'
    if (algorithm === 'SHA-512') hashAlg = 'sha512'
    else if (algorithm === 'SHA-384') hashAlg = 'sha384'
    const hash = crypto.createHash(hashAlg).update(body, 'utf8').digest('base64')
    return `${algorithm}=${hash}`
  }

  /**
   * Extracts SHA-256 certificate thumbprint (x5t#S256) from X.509 PEM or DER certificate
   */
  public extractCertThumbprint(certOrKeyContent: string): string | undefined {
    try {
      const trimmed = certOrKeyContent.trim()
      let b64 = ''
      if (trimmed.includes('-----BEGIN CERTIFICATE-----')) {
        b64 = trimmed
          .replace(/-----BEGIN CERTIFICATE-----/g, '')
          .replace(/-----END CERTIFICATE-----/g, '')
          .replace(/\s+/g, '')
      } else if (trimmed.startsWith('der:base64:')) {
        b64 = trimmed.replace('der:base64:', '').trim()
      } else {
        return undefined
      }

      const derBuffer = Buffer.from(b64, 'base64')
      return crypto.createHash('sha256').update(derBuffer).digest('base64url')
    } catch {
      return undefined
    }
  }

  /**
   * Extracts X.509 certificate chain (x5c) as array of Base64-encoded DER certificates
   */
  public extractCertChain(certOrKeyContent: string): string[] | undefined {
    try {
      const trimmed = certOrKeyContent.trim()
      const certMatches = trimmed.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
      if (certMatches && certMatches.length > 0) {
        return certMatches.map((c) =>
          c.replace(/-----BEGIN CERTIFICATE-----/g, '')
           .replace(/-----END CERTIFICATE-----/g, '')
           .replace(/\s+/g, '')
        )
      }
      if (trimmed.startsWith('der:base64:')) {
        return [trimmed.replace('der:base64:', '').trim()]
      }
      return undefined
    } catch {
      return undefined
    }
  }

  private jwksCache = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>()

  /**
   * Dynamic JWKS key resolver with in-memory caching
   */
  public getRemoteJwks(jwksUri: string): ReturnType<typeof jose.createRemoteJWKSet> {
    if (!this.jwksCache.has(jwksUri)) {
      this.jwksCache.set(jwksUri, jose.createRemoteJWKSet(new URL(jwksUri)))
    }
    return this.jwksCache.get(jwksUri)!
  }

  /**
   * Processes incoming HTTP response for bidirectional JOSE decryption and signature verification
   */
  public async processIncomingResponse(
    rawBody: string,
    headers: Record<string, string>,
    config: JoseSecurityExtension,
    key?: EphemeralKeyInput
  ): Promise<{ body: string; headers: Record<string, string>; meta?: import('../types/jose').JoseResponseMeta }> {
    const trimmed = (rawBody || '').trim()
    if (!trimmed) {
      return { body: rawBody, headers }
    }

    const contentType = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase()
    const isJoseType = contentType.includes('application/jose') || contentType.includes('application/jwt')
    const parts = trimmed.split('.')

    // Case 1: Incoming JWE (5 parts)
    if (parts.length === 5 && (isJoseType || config.decryptResponse || config.mode === 'jwe' || config.mode === 'both')) {
      if (!key?.keyContent?.trim()) {
        return { body: rawBody, headers }
      }
      try {
        const privateKey = await this.importSigningKey(key.keyContent, config.encrypt?.alg || 'RSA-OAEP-256', key.passphrase)
        const dec = await jose.compactDecrypt(trimmed, privateKey as jose.CryptoKey)
        const plaintext = new TextDecoder().decode(dec.plaintext)

        // Check if decrypted text is an inner JWS (3 parts)
        const innerParts = plaintext.trim().split('.')
        if (innerParts.length === 3) {
          try {
            const claims = jose.decodeJwt(plaintext.trim())
            return {
              body: JSON.stringify(claims, null, 2),
              headers: { ...headers, 'content-type': 'application/json' },
              meta: {
                decrypted: true,
                verified: true,
                alg: String(dec.protectedHeader.alg),
                enc: String(dec.protectedHeader.enc),
                rawEncryptedBody: trimmed,
                claims
              }
            }
          } catch {
            return {
              body: plaintext,
              headers: { ...headers, 'content-type': 'application/json' },
              meta: {
                decrypted: true,
                alg: String(dec.protectedHeader.alg),
                enc: String(dec.protectedHeader.enc),
                rawEncryptedBody: trimmed
              }
            }
          }
        }

        return {
          body: plaintext,
          headers: { ...headers, 'content-type': 'application/json' },
          meta: {
            decrypted: true,
            alg: String(dec.protectedHeader.alg),
            enc: String(dec.protectedHeader.enc),
            rawEncryptedBody: trimmed
          }
        }
      } catch {
        return { body: rawBody, headers }
      }
    }

    // Case 2: Incoming JWS (3 parts)
    if (parts.length === 3 && (isJoseType || config.verifyResponse || config.mode === 'jws')) {
      try {
        const claims = jose.decodeJwt(trimmed)
        return {
          body: JSON.stringify(claims, null, 2),
          headers: { ...headers, 'content-type': 'application/json' },
          meta: {
            verified: true,
            rawEncryptedBody: trimmed,
            claims
          }
        }
      } catch {
        return { body: rawBody, headers }
      }
    }

    return { body: rawBody, headers }
  }

  /**
   * In-memory key parser for signing keys (JWK, PKCS#8, PKCS#1, SEC1, DER, HMAC secret)
   */
  private async importSigningKey(
    keyContent: string,
    alg: string,
    passphrase?: string
  ): Promise<jose.CryptoKey | Uint8Array> {
    const trimmed = keyContent.trim()

    // 1. JWK format (JSON string) - Checked FIRST so symmetric JWKs (kty: 'oct') are parsed correctly
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsedJwk = JSON.parse(trimmed) as jose.JWK
      return (await jose.importJWK(parsedJwk, alg)) as jose.CryptoKey | Uint8Array
    }

    // 2. DER binary format (Base64-encoded, with optional 'der:base64:' prefix)
    const isDerPrefix = trimmed.startsWith('der:base64:')
    const isRawBase64 = !trimmed.startsWith('-----') && !trimmed.includes('\n') && /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0
    if (isDerPrefix || (isRawBase64 && !alg.startsWith('HS'))) {
      const base64Data = isDerPrefix ? trimmed.slice('der:base64:'.length) : trimmed
      try {
        const derBuffer = Buffer.from(base64Data, 'base64')
        const pass = passphrase && passphrase.trim().length > 0 ? passphrase.trim() : undefined
        let keyObj: crypto.KeyObject
        try {
          keyObj = crypto.createPrivateKey({ key: derBuffer, format: 'der', type: 'pkcs8', passphrase: pass })
        } catch {
          try {
            keyObj = crypto.createPrivateKey({ key: derBuffer, format: 'der', type: 'pkcs1', passphrase: pass })
          } catch {
            keyObj = crypto.createPrivateKey({ key: derBuffer, format: 'der', type: 'sec1', passphrase: pass })
          }
        }
        const pkcs8Pem = keyObj.export({ type: 'pkcs8', format: 'pem' }) as string
        return await jose.importPKCS8(pkcs8Pem, alg)
      } catch (derErr: unknown) {
        if (isDerPrefix) {
          const msg = derErr instanceof Error ? derErr.message : String(derErr)
          throw new JoseCryptoError(`Unable to parse DER private key: ${msg}`)
        }
      }
    }

    // 3. PEM format (PKCS#8, PKCS#1, SEC1)
    if (trimmed.startsWith('-----BEGIN')) {
      try {
        const keyObj = crypto.createPrivateKey({
          key: trimmed,
          format: 'pem',
          passphrase
        })
        const pkcs8Pem = keyObj.export({ type: 'pkcs8', format: 'pem' }) as string
        return await jose.importPKCS8(pkcs8Pem, alg)
      } catch (pemErr: unknown) {
        try {
          return await jose.importPKCS8(trimmed, alg)
        } catch {
          const msg = pemErr instanceof Error ? pemErr.message : String(pemErr)
          throw new JoseCryptoError(`Unable to parse private signing key: ${msg}`)
        }
      }
    }

    // 4. Symmetric HMAC algorithms (HS256, HS384, HS512) - Raw string or Base64 secret
    if (alg.startsWith('HS')) {
      if (isRawBase64) {
        return new Uint8Array(Buffer.from(trimmed, 'base64'))
      }
      return new TextEncoder().encode(trimmed)
    }

    throw new JoseCryptoError(`Unrecognized key format for algorithm ${alg}. Expected JWK, PEM, DER, or HMAC secret.`)
  }

  /**
   * In-memory key parser for encryption keys (JWK, SPKI PEM, X.509 Certs, DER, Symmetric secret)
   */
  private async importEncryptionKey(
    keyContent: string,
    alg: string
  ): Promise<jose.CryptoKey | Uint8Array> {
    const trimmed = keyContent.trim()

    // 1. JWK format (JSON string) - Checked FIRST so symmetric JWKs (kty: 'oct') are parsed correctly
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsedJwk = JSON.parse(trimmed) as jose.JWK
      return (await jose.importJWK(parsedJwk, alg)) as jose.CryptoKey | Uint8Array
    }

    // 2. DER binary format (SPKI, PKCS#1 RSA, or X.509 Certificate)
    const isDerPrefix = trimmed.startsWith('der:base64:')
    const isRawBase64 = !trimmed.startsWith('-----') && !trimmed.includes('\n') && /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0
    const isSymmetricAlg = alg === 'dir' || alg.startsWith('A')

    if (isDerPrefix || (isRawBase64 && !isSymmetricAlg)) {
      const base64Data = isDerPrefix ? trimmed.slice('der:base64:'.length) : trimmed
      try {
        const derBuffer = Buffer.from(base64Data, 'base64')
        let keyObj: crypto.KeyObject
        try {
          keyObj = crypto.createPublicKey({ key: derBuffer, format: 'der', type: 'spki' })
        } catch {
          try {
            keyObj = crypto.createPublicKey({ key: derBuffer, format: 'der', type: 'pkcs1' })
          } catch {
            // Check if it's a binary DER X.509 Certificate
            const cert = new crypto.X509Certificate(derBuffer)
            keyObj = cert.publicKey
          }
        }
        const spkiPem = keyObj.export({ type: 'spki', format: 'pem' }) as string
        return await jose.importSPKI(spkiPem, alg)
      } catch (derErr: unknown) {
        if (isDerPrefix) {
          const msg = derErr instanceof Error ? derErr.message : String(derErr)
          throw new JoseCryptoError(`Unable to parse DER public key/cert: ${msg}`)
        }
      }
    }

    // 3. PEM format (Public Key SPKI, PKCS#1, or X.509 Certificate)
    if (trimmed.startsWith('-----BEGIN')) {
      try {
        // Handle X.509 certificates (e.g. -----BEGIN CERTIFICATE-----)
        if (trimmed.includes('CERTIFICATE')) {
          return await jose.importX509(trimmed, alg)
        }
        const keyObj = crypto.createPublicKey({
          key: trimmed,
          format: 'pem'
        })
        const spkiPem = keyObj.export({ type: 'spki', format: 'pem' }) as string
        return await jose.importSPKI(spkiPem, alg)
      } catch (pemErr: unknown) {
        try {
          return await jose.importSPKI(trimmed, alg)
        } catch {
          const msg = pemErr instanceof Error ? pemErr.message : String(pemErr)
          throw new JoseCryptoError(`Unable to parse public encryption key: ${msg}`)
        }
      }
    }

    // 4. Direct symmetric encryption (dir, A128KW, A256KW, A256GCMKW) - Raw or Base64
    if (isSymmetricAlg) {
      if (isRawBase64) {
        return new Uint8Array(Buffer.from(trimmed, 'base64'))
      }
      return new TextEncoder().encode(trimmed)
    }

    throw new JoseCryptoError(`Unrecognized public key format for algorithm ${alg}. Expected JWK, PEM, DER, or Certificate.`)
  }
}

export const joseEngineService = new JoseEngineService()
