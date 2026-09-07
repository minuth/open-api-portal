import crypto from 'node:crypto'
import { eq, and, gt } from 'drizzle-orm'
import { db } from '../db/client'
import { sessions, UserRecord, SessionRecord } from '../db/schema'
import { userService } from './user-service'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 Hours

export class AuthService {
  public authenticate(username: string, password: string): UserRecord | null {
    const user = userService.findByUsername(username)
    if (!user) return null

    const isValid = userService.verifyPassword(password, user.passwordHash)
    if (!isValid) return null

    return user
  }

  public createSession(userId: string): SessionRecord {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString()
    const sessionId = `sess_${crypto.randomBytes(16).toString('hex')}`

    const newSession = {
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now.toISOString()
    }

    db.insert(sessions).values(newSession).run()
    return newSession
  }

  public getSessionWithUser(sessionId: string): { session: SessionRecord; user: UserRecord } | null {
    if (!sessionId) return null

    const nowIso = new Date().toISOString()
    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, nowIso)))
      .get()

    if (!session) return null

    const user = userService.findById(session.userId)
    if (!user) return null

    return { session, user }
  }

  public revokeSession(sessionId: string): void {
    if (sessionId) {
      db.delete(sessions).where(eq(sessions.id, sessionId)).run()
    }
  }
}

export const authService = new AuthService()
