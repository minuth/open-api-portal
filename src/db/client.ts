import path from 'node:path'
import fs from 'node:fs'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

const storageDir = path.resolve(process.cwd(), './storage')
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true })
}

const dbPath = path.join(storageDir, 'portal.db')
const sqlite = new Database(dbPath)

// Initialize Drizzle ORM client
export const db = drizzle(sqlite, { schema })

/**
 * Initializes and executes database migrations via Drizzle ORM and ensures schema tables exist
 */
export function initDatabase(): void {
  const migrationsFolder = path.resolve(process.cwd(), './drizzle')
  if (fs.existsSync(migrationsFolder)) {
    try {
      migrate(db, { migrationsFolder })
      console.log('[Drizzle Migration] Migrations applied successfully.')
    } catch (err: unknown) {
      const errStr = String(err) + ((err as { cause?: Error })?.cause?.message || '')
      if (errStr.includes('already exists')) {
        console.warn('[Drizzle Migration] Database tables already exist. Proceeding safely.')
      } else {
        console.error('[Drizzle Migration Error]:', err)
      }
    }
  }
}
