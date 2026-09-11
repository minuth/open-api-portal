import crypto from 'node:crypto'
import { eq, desc, or } from 'drizzle-orm'
import { db } from '../db/client'
import { sharedLinks, SharedLinkRecord, NewSharedLinkRecord, users } from '../db/schema'
import { StorageError } from '../types/errors'

export interface CreateShareLinkInput {
  specId?: string
  specIds?: string[]
  specTitle?: string
  specTitles?: string[]
  userId: string
  expiresInHours?: number | 'never'
  neverExpires?: boolean
  customExpiresAt?: string
  allowSandboxUpload?: boolean
  customAlias?: string
}

export interface SharedLinkWithCreator extends SharedLinkRecord {
  creatorUsername?: string
  isExpired: boolean
  specIds: string[]
}

const RESERVED_ALIASES = new Set([
  'api',
  'shared',
  'create',
  'revoke',
  'endpoint',
  'bulk-delete',
  'settings',
  'specs',
  'login',
  'logout',
  'setup'
])

/**
 * Robustly parses single or multiple specification IDs from database storage.
 * Supports single ID string, JSON array string, or comma-separated list.
 */
export function parseSpecIds(rawSpecId: string): string[] {
  if (!rawSpecId || typeof rawSpecId !== 'string') return []
  const trimmed = rawSpecId.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean)
      }
    } catch {}
  }
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return [trimmed].filter(Boolean)
}

export class ShareService {
  /**
   * Generates a cryptographically strong, high-entropy opaque token.
   */
  public generateOpaqueToken(): string {
    return `psh_${crypto.randomBytes(24).toString('hex')}`
  }

  /**
   * Creates a new public share link for one or more specifications.
   */
  public createShareLink(input: CreateShareLinkInput): SharedLinkRecord {
    let ids: string[] = []
    if (input.specIds && Array.isArray(input.specIds)) {
      ids = input.specIds.map((s) => s.trim()).filter(Boolean)
    } else if (input.specId) {
      ids = parseSpecIds(input.specId)
    }

    if (ids.length === 0) {
      throw new StorageError('At least one specification must be selected to generate a share link.')
    }

    // Deduplicate IDs
    ids = Array.from(new Set(ids))

    // Formulate stored specId (single string or JSON array string)
    const storedSpecId = ids.length === 1 ? ids[0] : JSON.stringify(ids)

    // Formulate human-readable specTitle
    let title = (input.specTitle || '').trim()
    if (!title && input.specTitles && input.specTitles.length > 0) {
      const validTitles = input.specTitles.map((t) => t.trim()).filter(Boolean)
      if (validTitles.length === 1) {
        title = validTitles[0]
      } else if (validTitles.length === 2) {
        title = `${validTitles[0]}, ${validTitles[1]}`
      } else if (validTitles.length > 2) {
        title = `${validTitles[0]}, ${validTitles[1]} (+${validTitles.length - 2} more)`
      }
    }
    if (!title) {
      title = ids.length === 1 ? ids[0] : `${ids[0]} (+${ids.length - 1} more)`
    }

    const now = new Date()
    let expiresAt: Date | null = null

    const isNever =
      input.neverExpires === true ||
      input.expiresInHours === 'never' ||
      input.expiresInHours === 0

    if (!isNever) {
      if (input.customExpiresAt) {
        expiresAt = new Date(input.customExpiresAt)
        if (isNaN(expiresAt.getTime()) || expiresAt <= now) {
          throw new StorageError('Custom expiration date must be a valid future datetime.')
        }
      } else {
        const hours =
          typeof input.expiresInHours === 'number' && input.expiresInHours > 0
            ? input.expiresInHours
            : 24
        expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000)
      }
    }

    // Validate and check uniqueness of custom alias if provided
    let alias: string | null = null
    if (input.customAlias && input.customAlias.trim()) {
      const cleanAlias = input.customAlias.trim().toLowerCase()
      if (!/^[a-z0-9_-]{2,60}$/.test(cleanAlias)) {
        throw new StorageError(
          'Custom alias must be 2–60 characters long and contain only lowercase letters, numbers, dashes, and underscores.'
        )
      }
      if (RESERVED_ALIASES.has(cleanAlias)) {
        throw new StorageError(
          `The alias '${cleanAlias}' is reserved for internal routing. Please choose a different alias.`
        )
      }

      const existing = db
        .select()
        .from(sharedLinks)
        .where(eq(sharedLinks.alias, cleanAlias))
        .get()

      if (existing) {
        throw new StorageError(
          `The alias '${cleanAlias}' is already in use. Please choose a unique alias.`
        )
      }

      alias = cleanAlias
    }

    const token = this.generateOpaqueToken()
    const id = `shl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const allowSandboxUpload = input.allowSandboxUpload ? 1 : 0

    const newRecord: NewSharedLinkRecord = {
      id,
      token,
      specId: storedSpecId,
      specTitle: title,
      createdById: input.userId,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      createdAt: now.toISOString(),
      lastAccessedAt: null,
      isActive: 1,
      allowSandboxUpload,
      alias
    }

    db.insert(sharedLinks).values(newRecord).run()

    const created = db.select().from(sharedLinks).where(eq(sharedLinks.id, id)).get()
    if (!created) {
      throw new StorageError('Failed to persist public share link.')
    }

    return created
  }

  /**
   * Validates an opaque share token OR custom unique alias and returns the record if valid and not expired.
   * Returns null if token/alias does not exist, is deactivated, or has expired.
   */
  public validateTokenOrAlias(tokenOrAlias: string): SharedLinkRecord | null {
    if (!tokenOrAlias || !tokenOrAlias.trim()) return null
    const query = tokenOrAlias.trim()

    const record = db
      .select()
      .from(sharedLinks)
      .where(or(eq(sharedLinks.token, query), eq(sharedLinks.alias, query)))
      .get()

    if (!record || record.isActive !== 1) {
      return null
    }

    if (record.expiresAt) {
      const now = new Date()
      const expiration = new Date(record.expiresAt)
      if (now >= expiration) {
        return null
      }
    }

    // Update lastAccessedAt asynchronously
    try {
      db.update(sharedLinks)
        .set({ lastAccessedAt: new Date().toISOString() })
        .where(eq(sharedLinks.id, record.id))
        .run()
    } catch {
      // Non-blocking for read flow
    }

    return record
  }

  /**
   * Retrieves a shared link record directly by its unique primary ID.
   */
  public getSharedLinkById(id: string): SharedLinkRecord | null {
    if (!id) return null
    return db.select().from(sharedLinks).where(eq(sharedLinks.id, id)).get() || null
  }

  /**
   * Legacy backward-compatible validator delegating to validateTokenOrAlias.
   */
  public validateToken(token: string): SharedLinkRecord | null {
    return this.validateTokenOrAlias(token)
  }

  /**
   * Lists all shared links with creator usernames and computed expiration status.
   */
  public listSharedLinks(): SharedLinkWithCreator[] {
    const records = db
      .select({
        link: sharedLinks,
        creator: {
          username: users.username
        }
      })
      .from(sharedLinks)
      .leftJoin(users, eq(sharedLinks.createdById, users.id))
      .orderBy(desc(sharedLinks.createdAt))
      .all()

    const now = new Date()
    return records.map((r) => ({
      ...r.link,
      creatorUsername: r.creator?.username || 'Unknown',
      isExpired:
        r.link.isActive !== 1 ||
        (r.link.expiresAt ? now >= new Date(r.link.expiresAt) : false),
      specIds: parseSpecIds(r.link.specId)
    }))
  }

  /**
   * Revokes (deactivates) a shared link by ID.
   */
  public revokeSharedLink(id: string): boolean {
    const result = db
      .update(sharedLinks)
      .set({ isActive: 0 })
      .where(eq(sharedLinks.id, id))
      .run()

    return result.changes > 0
  }

  /**
   * Permanently deletes a shared link by ID.
   */
  public deleteSharedLink(id: string): boolean {
    const result = db.delete(sharedLinks).where(eq(sharedLinks.id, id)).run()
    return result.changes > 0
  }

  /**
   * Permanently deletes multiple shared links by IDs.
   */
  public deleteSharedLinks(ids: string[]): number {
    if (!ids || ids.length === 0) return 0
    let count = 0
    for (const id of ids) {
      if (this.deleteSharedLink(id)) {
        count++
      }
    }
    return count
  }
}

export const shareService = new ShareService()
