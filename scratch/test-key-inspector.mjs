import fs from 'node:fs'

// Read public/js/app-init.js and run it in a mock window context
const code = fs.readFileSync('public/js/app-init.js', 'utf8')
const mockWindow = {
  localStorage: { getItem: () => 'dark', setItem: () => {} },
  document: { documentElement: { setAttribute: () => {} }, addEventListener: () => {} },
  addEventListener: () => {}
}

const fn = new Function('window', 'document', 'localStorage', code)
fn(mockWindow, mockWindow.document, mockWindow.localStorage)

const inspectJoseKey = mockWindow.inspectJoseKey
const checkJoseKeyCompatibility = mockWindow.checkJoseKeyCompatibility

const ecPublic = fs.readFileSync('dummy-keys/ec-public.pem', 'utf8')
const ecPrivate = fs.readFileSync('dummy-keys/ec-private.pem', 'utf8')
const rsaPublic = fs.readFileSync('dummy-keys/rsa-public.pem', 'utf8')
const rsaPrivate = fs.readFileSync('dummy-keys/rsa-private.pem', 'utf8')

// Test 1: EC Public Key with filenames that DO NOT contain 'ec'
const problematicFilenames = [
  'server-enc-public.pem',
  'partner-enc-public.pem',
  'signing-key.pem',
  'vault-public.pem',
  'my-key.pem',
  'public.key'
]

console.log('--- Testing EC Public Key with non-"ec" filenames ---')
for (const fn of problematicFilenames) {
  const inspected = inspectJoseKey(ecPublic, fn)
  console.log(`[${fn}] Family: ${inspected.family}, Role: ${inspected.role}, Format: ${inspected.format}`)
  if (inspected.family !== 'EC') {
    throw new Error(`Failed for ${fn}: expected EC, got ${inspected.family}`)
  }
  const compat = checkJoseKeyCompatibility(inspected.family, inspected.role, 'EC', 'public')
  if (!compat.valid) {
    throw new Error(`Compatibility failed for ${fn}: ${compat.msg}`)
  }
}

console.log('--- Testing EC Private Key with non-"ec" filenames ---')
for (const fn of ['server-signing-key.pem', 'vault-priv.key', 'partner.key']) {
  const inspected = inspectJoseKey(ecPrivate, fn)
  console.log(`[${fn}] Family: ${inspected.family}, Role: ${inspected.role}`)
  if (inspected.family !== 'EC') {
    throw new Error(`Failed for ${fn}: expected EC, got ${inspected.family}`)
  }
  const compat = checkJoseKeyCompatibility(inspected.family, inspected.role, 'EC', 'private')
  if (!compat.valid) {
    throw new Error(`Compatibility failed for ${fn}: ${compat.msg}`)
  }
}

console.log('--- Testing RSA Public & Private Keys ---')
const rsaPubInspected = inspectJoseKey(rsaPublic, 'partner-pub.pem')
console.log(`[partner-pub.pem] Family: ${rsaPubInspected.family}, Role: ${rsaPubInspected.role}`)
if (rsaPubInspected.family !== 'RSA') {
  throw new Error(`RSA public failed: expected RSA, got ${rsaPubInspected.family}`)
}

const rsaPrivInspected = inspectJoseKey(rsaPrivate, 'partner-signer.pem')
console.log(`[partner-signer.pem] Family: ${rsaPrivInspected.family}, Role: ${rsaPrivInspected.role}`)
if (rsaPrivInspected.family !== 'RSA') {
  throw new Error(`RSA private failed: expected RSA, got ${rsaPrivInspected.family}`)
}

console.log('SUCCESS! All key inspector tests passed flawlessly!')
