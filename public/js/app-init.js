(function () {
  var t = localStorage.getItem('theme') || 'dark'
  document.documentElement.setAttribute('data-theme', t)
})()

// Allow HTMX to swap 4xx error responses (e.g. 400 Bad Request, 401 Unauthorized, 422 Unprocessable)
// into target containers so validation and operational error alerts are rendered.
document.addEventListener('htmx:beforeSwap', function (evt) {
  if (evt.detail.xhr && evt.detail.xhr.status >= 400 && evt.detail.xhr.status < 500) {
    evt.detail.shouldSwap = true
    evt.detail.isError = false
  }
})

document.addEventListener('alpine:init', function () {
  Alpine.data('appState', function () {
    return {
      openUploadModal: false,
      openTokenModal: false,
      openShareModal: false,
      openErrorDialog: false,
      errorTitle: '',
      errorMessage: '',
      theme: localStorage.getItem('theme') || 'dark',
      toggleTheme: function () {
        this.theme = this.theme === 'dark' ? 'light' : 'dark'
        localStorage.setItem('theme', this.theme)
        document.documentElement.setAttribute('data-theme', this.theme)
      }
    }
  })
})

window.formatJsonString = function (str) {
  if (!str) return str
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch (err) {
    return str
  }
}

window.formatUrlEncodedString = function (str) {
  if (!str) return str
  var trimmed = str.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      var parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        var params = new URLSearchParams()
        for (var k in parsed) {
          if (Object.prototype.hasOwnProperty.call(parsed, k)) {
            var v = parsed[k]
            if (v !== undefined && v !== null) {
              params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
            }
          }
        }
        return params.toString()
      }
    } catch (e) {}
  }
  try {
    var lines = trimmed.split(/[\r\n]+/).map(function (l) { return l.trim() }).filter(Boolean)
    if (lines.length > 1 && !trimmed.includes('&')) {
      var p = new URLSearchParams()
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i]
        var idx = l.indexOf('=') !== -1 ? l.indexOf('=') : l.indexOf(':')
        if (idx !== -1) {
          p.append(l.slice(0, idx).trim(), l.slice(idx + 1).trim())
        }
      }
      return p.toString()
    }
  } catch (e) {}
  return trimmed
}

window.formatXmlString = function (xml) {
  if (!xml) return xml
  try {
    var formatted = ''
    var reg = /(>)(<)(\/*)/g
    var cleanXml = xml.replace(reg, '$1\r\n$2$3')
    var pad = 0
    var nodes = cleanXml.split('\r\n')
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i].trim()
      if (!node) continue
      var indent = 0
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0
      } else if (node.match(/^<\/\w/)) {
        if (pad !== 0) pad -= 1
      } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
        indent = 1
      } else {
        indent = 0
      }
      var padding = ''
      for (var j = 0; j < pad; j++) padding += '  '
      formatted += padding + node + '\r\n'
      pad += indent
    }
    return formatted.trim()
  } catch (e) {
    return xml
  }
}

function detectKeyFamilyFromBase64(cleanB64, keyFormat) {
  if (!cleanB64) return 'unknown'

  // 1. OID matching (Deterministic cryptographic indicators in Base64)
  // - id-ecPublicKey (1.2.840.10045.2.1): 'KoZIzj0CAQY', 'qGSM49AgEG', 'CAQYIKoZIzj0DAQc'
  // - RFC 8410 Ed25519 (1.3.101.112): 'MCowBQYDK2Vw'
  if (
    cleanB64.includes('KoZIzj0CAQY') ||
    cleanB64.includes('qGSM49AgEG') ||
    cleanB64.includes('CAQYIKoZIzj0DAQc') ||
    cleanB64.includes('MCowBQYDK2Vw')
  ) {
    return 'EC'
  }

  // - rsaEncryption (1.2.840.113549.1.1.1): 'BgkqhkiG9w0BAQ'
  if (cleanB64.includes('BgkqhkiG9w0BAQ')) {
    return 'RSA'
  }

  // 2. Deterministic Content / Byte-Length Heuristic (RFC 5280 / RFC 5958 / RFC 3447)
  var byteLen = Math.floor(cleanB64.length * 3 / 4)

  if (keyFormat === 'spki' || keyFormat === 'public') {
    // EC NIST P-256 SPKI Public Key: Exactly 91 bytes (Base64 length ~120-130 chars)
    // EC NIST P-384: 120 bytes; P-521: 158 bytes; Ed25519: 44 bytes
    // RSA (2048-bit) SPKI Public Key: >= 294 bytes (Base64 length ~390-400 chars)
    // RSA (4096-bit) SPKI Public Key: >= 550 bytes (Base64 length ~730+ chars)
    if (byteLen < 250) return 'EC'
    if (byteLen >= 250) return 'RSA'
  }

  if (keyFormat === 'pkcs8' || keyFormat === 'private') {
    // EC P-256 PKCS#8 Private Key: ~138 bytes (Base64 ~184 chars)
    // EC P-384 / P-521: < 300 bytes
    // RSA PKCS#8 Private Key (2048-bit): >= 1,218 bytes (Base64 ~1,624 chars)
    // RSA PKCS#8 Private Key (4096-bit): > 2,300 bytes (Base64 > 3,000 chars)
    if (byteLen < 500) return 'EC'
    if (byteLen >= 500) return 'RSA'
  }

  if (keyFormat === 'cert') {
    // EC X.509 certs typically < 900 bytes; RSA certs >= 1,100 bytes
    if (byteLen < 900) return 'EC'
    return 'RSA'
  }

  return 'unknown'
}

window.inspectJoseKey = function (content, filename) {
  var fn = (filename || '').toLowerCase()
  var res = {
    format: 'Unknown Format',
    family: 'unknown',
    role: 'unknown',
    kid: '',
    details: '',
    isCert: false
  }

  if (!content) return res

  if (content.startsWith('der:base64:')) {
    var b64Data = content.substring(11).trim()
    var isCert = fn.endsWith('.crt') || fn.endsWith('.cer')
    var isPriv = fn.includes('priv')
    res.format = isCert ? 'X.509 Certificate (DER)' : 'Binary DER'
    res.role = isCert ? 'public' : (isPriv ? 'private' : 'public')
    res.isCert = isCert
    var derFamily = detectKeyFamilyFromBase64(b64Data, isCert ? 'cert' : (isPriv ? 'private' : 'public'))
    if (derFamily !== 'unknown') {
      res.family = derFamily
    } else if (fn.includes('rsa')) {
      res.family = 'RSA'
    } else if (fn.includes('ec')) {
      res.family = 'EC'
    }
    res.details = 'DER-encoded binary ASN.1' + (res.family !== 'unknown' ? ' (' + res.family + ')' : '')
    return res
  }

  var trimmed = content.trim()

  // 1. JSON / JWK
  if (trimmed.startsWith('{')) {
    try {
      var jwk = JSON.parse(trimmed)
      res.format = 'JWK (JSON Web Key)'
      if (jwk.kid) res.kid = jwk.kid
      if (jwk.kty === 'RSA') {
        res.family = 'RSA'
        res.role = jwk.d ? 'private' : 'public'
        res.details = 'RSA ' + (jwk.d ? 'Private Key' : 'Public Key') + (jwk.alg ? ' (' + jwk.alg + ')' : '')
      } else if (jwk.kty === 'EC') {
        res.family = 'EC'
        res.role = jwk.d ? 'private' : 'public'
        res.details = 'EC ' + (jwk.crv || 'P-256') + ' ' + (jwk.d ? 'Private Key' : 'Public Key')
      } else if (jwk.kty === 'oct') {
        res.family = 'symmetric'
        res.role = 'symmetric'
        res.details = 'Symmetric Key' + (jwk.alg ? ' (' + jwk.alg + ')' : '')
      }
      return res
    } catch (e) {}
  }

  // 2. PEM format
  if (trimmed.includes('-----BEGIN')) {
    if (trimmed.includes('BEGIN RSA PRIVATE KEY')) {
      res.format = 'PKCS#1 RSA Private Key'
      res.family = 'RSA'
      res.role = 'private'
      res.details = 'RSA Private Key (PKCS#1)'
    } else if (trimmed.includes('BEGIN EC PRIVATE KEY')) {
      res.format = 'SEC1 EC Private Key'
      res.family = 'EC'
      res.role = 'private'
      res.details = 'EC Private Key (NIST P-256)'
    } else if (trimmed.includes('BEGIN PRIVATE KEY')) {
      var cleanB64 = trimmed.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
      var detectedFamily = detectKeyFamilyFromBase64(cleanB64, 'pkcs8')
      res.format = 'PKCS#8 Private Key'
      res.role = 'private'
      res.family = detectedFamily !== 'unknown' ? detectedFamily : (fn.includes('ec') ? 'EC' : (fn.includes('rsa') ? 'RSA' : 'RSA/EC'))
      res.details = 'Standard PKCS#8 Private Key' + (res.family !== 'unknown' ? ' (' + res.family + ')' : '')
    } else if (trimmed.includes('BEGIN ENCRYPTED PRIVATE KEY')) {
      var cleanB64 = trimmed.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
      var detectedFamily = detectKeyFamilyFromBase64(cleanB64, 'pkcs8')
      res.format = 'Encrypted PKCS#8 Private Key'
      res.role = 'private'
      if (detectedFamily !== 'unknown') res.family = detectedFamily
      res.details = 'Encrypted Key (Passphrase Required)' + (res.family !== 'unknown' ? ' (' + res.family + ')' : '')
    } else if (trimmed.includes('BEGIN CERTIFICATE')) {
      var cleanB64 = trimmed.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
      var detectedFamily = detectKeyFamilyFromBase64(cleanB64, 'cert')
      res.format = 'X.509 Certificate (PEM)'
      res.role = 'public'
      res.isCert = true
      res.family = detectedFamily !== 'unknown' ? detectedFamily : (fn.includes('ec') ? 'EC' : (fn.includes('rsa') ? 'RSA' : 'unknown'))
      res.details = 'X.509 Public Certificate' + (res.family !== 'unknown' ? ' (' + res.family + ')' : '')
    } else if (trimmed.includes('BEGIN PUBLIC KEY')) {
      var cleanB64 = trimmed.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
      var detectedFamily = detectKeyFamilyFromBase64(cleanB64, 'spki')
      res.format = 'SPKI SubjectPublicKeyInfo'
      res.role = 'public'
      res.family = detectedFamily !== 'unknown' ? detectedFamily : (fn.includes('ec') ? 'EC' : (fn.includes('rsa') ? 'RSA' : 'unknown'))
      res.details = 'Standard Public Key (SPKI)' + (res.family !== 'unknown' ? ' (' + res.family + ')' : '')
    }
    return res
  }

  // 3. Raw text symmetric secret
  if (trimmed.length > 0 && !trimmed.includes('\n')) {
    res.format = 'Raw Text Secret'
    res.family = 'symmetric'
    res.role = 'symmetric'
    res.details = 'Symmetric Secret (' + trimmed.length + ' chars)'
    return res
  }

  return res
}

window.checkJoseKeyCompatibility = function (keyFamily, keyRole, expectedFamily, expectedRole) {
  if (!keyFamily || keyFamily === 'unknown') return { valid: true, msg: 'Key loaded' }
  if (expectedFamily && expectedFamily !== 'other') {
    if (expectedFamily === 'RSA' && keyFamily !== 'RSA' && keyFamily !== 'RSA/EC') {
      return { valid: false, msg: 'Algorithm requires an RSA key, but ' + keyFamily + ' was provided' }
    }
    if (expectedFamily === 'EC' && keyFamily !== 'EC' && keyFamily !== 'RSA/EC') {
      return { valid: false, msg: 'Algorithm requires an EC key (P-256), but ' + keyFamily + ' was provided' }
    }
    if (expectedFamily === 'symmetric' && keyFamily !== 'symmetric') {
      return { valid: false, msg: 'Algorithm requires a symmetric secret, but ' + keyFamily + ' was provided' }
    }
  }
  if (expectedRole === 'private' && keyRole === 'public') {
    return { valid: false, msg: 'A private signing key is required, but a public key was loaded' }
  }
  return { valid: true, msg: 'Compatible with algorithm requirements' }
}

window.parseJwtClaims = function (token) {
  if (!token || typeof token !== 'string') return null
  var parts = token.trim().split('.')
  if (parts.length < 2) return null

  try {
    var decodeB64Url = function (str) {
      var b64 = str.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      return decodeURIComponent(
        atob(b64)
          .split('')
          .map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
          })
          .join('')
      )
    }

    var header = JSON.parse(decodeB64Url(parts[0]))
    var payload = JSON.parse(decodeB64Url(parts[1]))
    var nowSec = Math.floor(Date.now() / 1000)
    var isExpired = false
    var expiresIn = ''

    if (payload.exp && typeof payload.exp === 'number') {
      if (payload.exp < nowSec) {
        isExpired = true
        var diffSec = nowSec - payload.exp
        var m = Math.floor(diffSec / 60)
        var h = Math.floor(m / 60)
        expiresIn = 'Expired ' + (h > 0 ? h + 'h ' + (m % 60) + 'm' : m + 'm') + ' ago'
      } else {
        isExpired = false
        var diffSec = payload.exp - nowSec
        var m = Math.floor(diffSec / 60)
        var h = Math.floor(m / 60)
        expiresIn = 'Expires in ' + (h > 0 ? h + 'h ' + (m % 60) + 'm' : m + 'm')
      }
    }

    return {
      valid: true,
      header: header,
      payload: payload,
      sub: payload.sub || '',
      iss: payload.iss || '',
      aud: payload.aud ? (Array.isArray(payload.aud) ? payload.aud.join(', ') : payload.aud) : '',
      exp: payload.exp,
      iat: payload.iat,
      isExpired: isExpired,
      expiresIn: expiresIn,
      formattedPayload: JSON.stringify(payload, null, 2),
      formattedHeader: JSON.stringify(header, null, 2)
    }
  } catch (err) {
    return null
  }
}

window.getSpecAuth = function (specId) {
  if (!specId) return null
  try {
    var raw = localStorage.getItem('portal_auth_' + specId)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

window.saveSpecAuth = function (specId, authData) {
  if (!specId) return
  try {
    if (!authData) {
      localStorage.removeItem('portal_auth_' + specId)
    } else {
      localStorage.setItem('portal_auth_' + specId, JSON.stringify(authData))
    }
  } catch (e) {}
}


