import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { users, UserRecord, NewUserRecord, UserRole } from '../db/schema'
import { StorageError } from '../types/errors'

export class UserService {
  public hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
    return `${salt}:${hash}`
  }

  public verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split(':')
    if (parts.length !== 2) return false
    const [salt, originalHash] = parts
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'))
  }

  public createUser(input: {
    username: string
    email: string
    password: string
    role: UserRole
  }): UserRecord {
    const existingUsername = db.select().from(users).where(eq(users.username, input.username.trim())).get()
    if (existingUsername) {
      throw new StorageError(`Username '${input.username}' is already taken.`)
    }

    const existingEmail = db.select().from(users).where(eq(users.email, input.email.trim().toLowerCase())).get()
    if (existingEmail) {
      throw new StorageError(`Email '${input.email}' is already registered.`)
    }

    const now = new Date().toISOString()
    const newUser: NewUserRecord = {
      id: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      username: input.username.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: this.hashPassword(input.password),
      role: input.role,
      createdAt: now,
      updatedAt: now
    }

    db.insert(users).values(newUser).run()
    const record = db.select().from(users).where(eq(users.id, newUser.id)).get()
    if (!record) {
      throw new StorageError('Failed to create user record.')
    }
    return record
  }

  public listUsers(): UserRecord[] {
    return db.select().from(users).all()
  }

  public findByUsername(username: string): UserRecord | null {
    const record = db.select().from(users).where(eq(users.username, username.trim())).get()
    return record || null
  }

  public findById(id: string): UserRecord | null {
    const record = db.select().from(users).where(eq(users.id, id)).get()
    return record || null
  }

  public deleteUser(id: string): boolean {
    const result = db.delete(users).where(eq(users.id, id)).run()
    return result.changes > 0
  }

  public seedInitialAdmin(): UserRecord | null {
    const allUsers = this.listUsers()
    if (allUsers.length === 0) {
      console.log('[Auth Seed] No users found. Seeding initial admin user (admin / admin123)...')
      return this.createUser({
        username: 'admin',
        email: 'admin@portal.local',
        password: 'admin123',
        role: 'admin'
      })
    }
    return null
  }
}

export const userService = new UserService()
