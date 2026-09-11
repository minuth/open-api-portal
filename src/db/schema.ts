import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const gitTokens = sqliteTable('git_tokens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').notNull(), // 'github' | 'gitlab'
  encryptedToken: text('encrypted_token').notNull(), // Unified format: "iv.ciphertext.tag"
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const gitSources = sqliteTable('git_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').notNull(), // 'github' | 'gitlab'
  repoUrl: text('repo_url').notNull(),
  filePath: text('file_path').notNull(),
  branch: text('branch').notNull().default('main'),
  tokenId: text('token_id').references(() => gitTokens.id, { onDelete: 'set null' }),
  cachedSpecId: text('cached_spec_id').notNull(),
  lastFetchedAt: text('last_fetched_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // 'admin' | 'editor' | 'viewer'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull()
})

export const sharedLinks = sqliteTable('shared_links', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  specId: text('spec_id').notNull(),
  specTitle: text('spec_title').notNull(),
  createdById: text('created_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
  lastAccessedAt: text('last_accessed_at'),
  isActive: integer('is_active').notNull().default(1),
  allowSandboxUpload: integer('allow_sandbox_upload').notNull().default(0),
  alias: text('alias').unique()
})

export type UserRole = 'admin' | 'editor' | 'viewer'

export type GitTokenRecord = typeof gitTokens.$inferSelect
export type NewGitTokenRecord = typeof gitTokens.$inferInsert

export type GitSourceRecord = typeof gitSources.$inferSelect
export type NewGitSourceRecord = typeof gitSources.$inferInsert

export type UserRecord = typeof users.$inferSelect
export type NewUserRecord = typeof users.$inferInsert

export type SessionRecord = typeof sessions.$inferSelect
export type NewSessionRecord = typeof sessions.$inferInsert

export type SharedLinkRecord = typeof sharedLinks.$inferSelect
export type NewSharedLinkRecord = typeof sharedLinks.$inferInsert

