import { shareService } from '../src/services/share-service'
import { db, initDatabase } from '../src/db/client'
import { sharedLinks, users } from '../src/db/schema'
import { eq } from 'drizzle-orm'

async function runTests() {
  initDatabase()
  console.log('🧪 Starting Share Link Feature Tests...')
  let passed = 0
  let failed = 0

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${msg}`)
      failed++
    }
  }

  const existingUser = db.select().from(users).get()
  if (!existingUser) {
    throw new Error('No user found in database for testing')
  }
  const userId = existingUser.id

  const createdIds: string[] = []

  try {
    // Test 1: Never Expires Link
    const neverLink = shareService.createShareLink({
      specIds: ['spec-1', 'spec-2'],
      specTitles: ['Spec One', 'Spec Two'],
      userId,
      neverExpires: true
    })
    createdIds.push(neverLink.id)
    assert(neverLink.expiresAt === null, 'Never expires link has null expiresAt')

    const validatedNever = shareService.validateTokenOrAlias(neverLink.token)
    assert(validatedNever !== null, 'Never expires link validates successfully')

    // Test 2: Custom Alias Link
    const testAlias = `unit-test-${Date.now()}`
    const aliasLink = shareService.createShareLink({
      specIds: ['spec-1'],
      specTitles: ['Spec One'],
      userId,
      customAlias: testAlias,
      allowSandboxUpload: true,
      expiresInHours: 24
    })
    createdIds.push(aliasLink.id)
    assert(aliasLink.alias === testAlias, `Custom alias '${testAlias}' saved`)
    assert(aliasLink.allowSandboxUpload === 1, 'allowSandboxUpload === 1 saved')

    // Test 3: Resolving by alias vs token
    const resolvedByAlias = shareService.validateTokenOrAlias(testAlias)
    assert(resolvedByAlias?.id === aliasLink.id, 'validateTokenOrAlias resolves by alias')
    const resolvedByToken = shareService.validateTokenOrAlias(aliasLink.token)
    assert(resolvedByToken?.id === aliasLink.id, 'validateTokenOrAlias resolves by token')

    // Test 4: Duplicate Alias rejection
    let duplicateErrorThrown = false
    try {
      shareService.createShareLink({
        specIds: ['spec-1'],
        userId,
        customAlias: testAlias
      })
    } catch (e: any) {
      duplicateErrorThrown = true
      assert(e.message.includes('already in use'), `Duplicate alias error message: ${e.message}`)
    }
    assert(duplicateErrorThrown, 'Duplicate alias properly rejected')

    // Test 5: Reserved Alias rejection
    let reservedErrorThrown = false
    try {
      shareService.createShareLink({
        specIds: ['spec-1'],
        userId,
        customAlias: 'api'
      })
    } catch (e: any) {
      reservedErrorThrown = true
      assert(e.message.includes('reserved'), `Reserved alias error message: ${e.message}`)
    }
    assert(reservedErrorThrown, 'Reserved alias properly rejected')

    // Test 6: Invalid Characters rejection
    let invalidCharErrorThrown = false
    try {
      shareService.createShareLink({
        specIds: ['spec-1'],
        userId,
        customAlias: 'invalid alias with spaces!'
      })
    } catch (e: any) {
      invalidCharErrorThrown = true
      assert(e.message.includes('Custom alias must be 2–60 characters'), `Invalid character error: ${e.message}`)
    }
    assert(invalidCharErrorThrown, 'Invalid alias characters properly rejected')

    // Test 7: List links includes never-expiring and alias
    const allLinks = shareService.listSharedLinks()
    const foundNever = allLinks.find((l) => l.id === neverLink.id)
    assert(foundNever !== undefined, 'Found never-expiring link in list')
    assert(foundNever?.isExpired === false, 'Never-expiring link isExpired === false')
    assert(foundNever?.expiresAt === null, 'Never-expiring link expiresAt === null in list')

    const foundAlias = allLinks.find((l) => l.id === aliasLink.id)
    assert(foundAlias?.alias === testAlias, 'Found custom alias link in list with alias')
    assert(foundAlias?.allowSandboxUpload === 1, 'Found custom alias link with allowSandboxUpload === 1')

  } finally {
    // Cleanup
    for (const id of createdIds) {
      try {
        db.delete(sharedLinks).where(eq(sharedLinks.id, id)).run()
      } catch {}
    }
  }

  console.log(`\n🎉 Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err)
  process.exit(1)
})
