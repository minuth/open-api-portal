(function () {
  var t = localStorage.getItem('theme') || 'dark'
  document.documentElement.setAttribute('data-theme', t)
})()

document.addEventListener('alpine:init', function () {
  Alpine.data('appState', function () {
    return {
      openUploadModal: false,
      openTokenModal: false,
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
    res.format = 'Binary DER'
    if (fn.endsWith('.crt') || fn.endsWith('.cer')) {
      res.format = 'X.509 Certificate (DER)'
      res.role = 'public'
      res.isCert = true
    } else {
      res.role = fn.includes('priv') ? 'private' : 'public'
    }
    if (fn.includes('rsa')) res.family = 'RSA'
    else if (fn.includes('ec')) res.family = 'EC'
    res.details = 'DER-encoded binary ASN.1'
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
      res.format = 'PKCS#8 Private Key'
      res.role = 'private'
      res.family = fn.includes('ec') ? 'EC' : (fn.includes('rsa') ? 'RSA' : 'RSA/EC')
      res.details = 'Standard PKCS#8 Private Key'
    } else if (trimmed.includes('BEGIN ENCRYPTED PRIVATE KEY')) {
      res.format = 'Encrypted PKCS#8 Private Key'
      res.role = 'private'
      res.details = 'Encrypted Key (Passphrase Required)'
    } else if (trimmed.includes('BEGIN CERTIFICATE')) {
      res.format = 'X.509 Certificate (PEM)'
      res.role = 'public'
      res.isCert = true
      res.family = fn.includes('ec') ? 'EC' : 'RSA'
      res.details = 'X.509 Public Certificate'
    } else if (trimmed.includes('BEGIN PUBLIC KEY')) {
      res.format = 'SPKI SubjectPublicKeyInfo'
      res.role = 'public'
      res.family = fn.includes('ec') ? 'EC' : 'RSA'
      res.details = 'Standard Public Key (SPKI)'
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

