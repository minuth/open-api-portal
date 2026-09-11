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

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : path.join(storageDir, 'portal.db')
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

  // Ensure shared_links table supports nullable expires_at and new columns
  try {
    const tableInfo = sqlite.pragma('table_info(shared_links)') as Array<{ name: string; notnull: number }>
    const expiresAtCol = tableInfo.find((c) => c.name === 'expires_at')
    if (expiresAtCol && expiresAtCol.notnull === 1) {
      sqlite.exec(`
        PRAGMA foreign_keys=off;
        CREATE TABLE shared_links_new (
          id text PRIMARY KEY NOT NULL,
          token text NOT NULL,
          spec_id text NOT NULL,
          spec_title text NOT NULL,
          created_by_id text NOT NULL,
          expires_at text,
          created_at text NOT NULL,
          last_accessed_at text,
          is_active integer DEFAULT 1 NOT NULL,
          allow_sandbox_upload integer DEFAULT 0 NOT NULL,
          alias text,
          FOREIGN KEY (created_by_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        );
        INSERT OR IGNORE INTO shared_links_new (id, token, spec_id, spec_title, created_by_id, expires_at, created_at, last_accessed_at, is_active)
          SELECT id, token, spec_id, spec_title, created_by_id, expires_at, created_at, last_accessed_at, is_active FROM shared_links;
        DROP TABLE shared_links;
        ALTER TABLE shared_links_new RENAME TO shared_links;
        CREATE UNIQUE INDEX IF NOT EXISTS shared_links_token_unique ON shared_links(token);
        CREATE UNIQUE INDEX IF NOT EXISTS shared_links_alias_idx ON shared_links(alias);
        PRAGMA foreign_keys=on;
      `)
    }
  } catch (e) {
    console.error('[Migration] Failed to migrate shared_links schema:', e)
  }

  // Ensure new columns on shared_links exist for upgrade safety
  try {
    sqlite.exec('ALTER TABLE shared_links ADD COLUMN allow_sandbox_upload INTEGER NOT NULL DEFAULT 0;')
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec('ALTER TABLE shared_links ADD COLUMN alias TEXT;')
    sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS shared_links_alias_idx ON shared_links(alias);')
  } catch {
    // Column or index already exists
  }
}
