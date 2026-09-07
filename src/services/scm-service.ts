import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { gitSources, gitTokens, GitSourceRecord, GitTokenRecord } from '../db/schema'
import { ISpecParser, OpenApiDocument } from '../types/openapi'
import { InvalidSpecError, StorageError } from '../types/errors'
import { encryptToken, decryptToken } from './crypto-service'

export interface ScmImportParams {
  name?: string
  provider?: 'github' | 'gitlab' | 'auto'
  repoUrl: string
  filePath: string
  branch?: string
  tokenId?: string
  newToken?: string
  newTokenName?: string
  mode?: 'save' | 'view'
}

export class ScmService {
  private readonly parser: ISpecParser

  constructor(parser: ISpecParser) {
    this.parser = parser
  }

  /**
   * Create and store a reusable AES-256 encrypted Git PAT token (unified format: "iv.ciphertext.tag")
   */
  public createToken(name: string, provider: 'github' | 'gitlab', rawToken: string): GitTokenRecord {
    const id = `token_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const now = new Date().toISOString()
    const unifiedEncryptedToken = encryptToken(rawToken.trim())

    const record: GitTokenRecord = {
      id,
      name: name.trim() || `${provider.toUpperCase()} Access Token`,
      provider,
      encryptedToken: unifiedEncryptedToken,
      createdAt: now,
      updatedAt: now
    }

    db.insert(gitTokens).values(record).run()
    return record
  }

  /**
   * List all stored Git tokens (without plain-text values)
   */
  public listTokens(): GitTokenRecord[] {
    return db.select().from(gitTokens).all()
  }

  /**
   * Get decrypted plain-text token by token ID
   */
  public getDecryptedToken(tokenId: string): string | undefined {
    const record = db.select().from(gitTokens).where(eq(gitTokens.id, tokenId)).get()
    if (!record) return undefined

    try {
      return decryptToken(record.encryptedToken)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new StorageError(`Failed to decrypt PAT token (${tokenId}): ${msg}`)
    }
  }

  /**
   * Delete stored token by ID
   */
  public deleteToken(tokenId: string): void {
    db.delete(gitTokens).where(eq(gitTokens.id, tokenId)).run()
  }

  /**
   * Update an existing stored Git PAT token
   */
  public updateToken(
    tokenId: string,
    name: string,
    provider: 'github' | 'gitlab',
    rawToken?: string
  ): GitTokenRecord {
    const existing = db.select().from(gitTokens).where(eq(gitTokens.id, tokenId)).get()
    if (!existing) {
      throw new StorageError(`Token with ID '${tokenId}' not found.`)
    }

    const now = new Date().toISOString()
    let encryptedToken = existing.encryptedToken

    if (rawToken && rawToken.trim()) {
      encryptedToken = encryptToken(rawToken.trim())
    }

    const updatedName = name.trim() || existing.name

    db.update(gitTokens)
      .set({
        name: updatedName,
        provider,
        encryptedToken,
        updatedAt: now
      })
      .where(eq(gitTokens.id, tokenId))
      .run()

    return {
      ...existing,
      name: updatedName,
      provider,
      encryptedToken,
      updatedAt: now
    }
  }

  /**
   * Parse provider and repository owner/name from URL
   */
  public parseGitUrl(rawUrl: string, explicitProvider?: string): { provider: 'github' | 'gitlab'; ownerRepo: string } {
    const trimmed = rawUrl.trim().replace(/\.git$/i, '')
    let provider: 'github' | 'gitlab' = 'github'

    if (explicitProvider === 'gitlab' || trimmed.includes('gitlab.com')) {
      provider = 'gitlab'
    } else {
      provider = 'github'
    }

    let ownerRepo = trimmed
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const urlObj = new URL(trimmed)
        ownerRepo = urlObj.pathname.replace(/^\//, '').replace(/\/$/, '')
      } catch {
        // Fallback
      }
    }

    return { provider, ownerRepo }
  }

  /**
   * Build raw content download URL and headers for GitHub / GitLab
   */
  public getRawFetchUrl(
    provider: 'github' | 'gitlab',
    ownerRepo: string,
    filePath: string,
    branch = 'main',
    token?: string
  ): { url: string; headers: Record<string, string> } {
    const cleanPath = filePath.replace(/^\//, '')
    const headers: Record<string, string> = {
      'User-Agent': 'Open-API-Portal-Agent'
    }

    if (provider === 'github') {
      if (token && token.trim()) {
        // API v3 raw endpoint for authenticated requests
        headers['Authorization'] = token.trim().startsWith('github_pat_') || token.trim().startsWith('ghp_')
          ? `Bearer ${token.trim()}`
          : `token ${token.trim()}`
        headers['Accept'] = 'application/vnd.github.v3.raw'
        const url = `https://api.github.com/repos/${ownerRepo}/contents/${cleanPath}?ref=${encodeURIComponent(branch)}`
        return { url, headers }
      } else {
        // Public raw CDN URL
        const url = `https://raw.githubusercontent.com/${ownerRepo}/${encodeURIComponent(branch)}/${cleanPath}`
        return { url, headers }
      }
    } else {
      // GitLab provider
      const encodedProjectPath = encodeURIComponent(ownerRepo)
      const encodedFilePath = encodeURIComponent(cleanPath)
      if (token && token.trim()) {
        headers['PRIVATE-TOKEN'] = token.trim()
      }
      const url = `https://gitlab.com/api/v4/projects/${encodedProjectPath}/repository/files/${encodedFilePath}/raw?ref=${encodeURIComponent(branch)}`
      return { url, headers }
    }
  }

  /**
   * Fetch YAML content from GitHub or GitLab repository
   */
  public async fetchRawYaml(
    provider: 'github' | 'gitlab',
    ownerRepo: string,
    filePath: string,
    branch = 'main',
    token?: string
  ): Promise<string> {
    const cleanPath = filePath.replace(/^\//, '')
    const { url, headers } = this.getRawFetchUrl(provider, ownerRepo, filePath, branch, token)

    try {
      const response = await fetch(url, { headers })

      if (!response.ok) {
        if (response.status === 404) {
          throw new InvalidSpecError(
            `File not found in ${provider === 'github' ? 'GitHub' : 'GitLab'} repository.\n` +
            `  Repo:   ${ownerRepo}\n` +
            `  Branch: ${branch}\n` +
            `  Path:   ${cleanPath}\n\n` +
            `Please verify the repository URL, branch name, and file path. ` +
            `For private repositories, make sure a valid Personal Access Token (PAT) is selected.`
          )
        }
        if (response.status === 401 || response.status === 403) {
          throw new InvalidSpecError(
            `Access denied (${response.status}) when fetching file from ${provider}. If the repository is private, please select or provide a valid Personal Access Token (PAT).`
          )
        }
        throw new InvalidSpecError(
          `Failed to fetch file from ${provider} (HTTP ${response.status}: ${response.statusText}).`
        )
      }

      const content = await response.text()
      if (!content || !content.trim()) {
        throw new InvalidSpecError(`The fetched file from ${provider} is empty.`)
      }

      return content
    } catch (err: unknown) {
      if (err instanceof InvalidSpecError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new StorageError(`Network error while fetching spec from SCM: ${msg}`)
    }
  }

  /**
   * Import an OpenAPI spec from GitHub / GitLab and save SCM configuration in database
   */
  public async importFromScm(params: ScmImportParams): Promise<{ doc: OpenApiDocument; record: GitSourceRecord }> {
    const { provider, ownerRepo } = this.parseGitUrl(params.repoUrl, params.provider)
    const branch = (params.branch || 'main').trim()
    const filePath = params.filePath.trim()

    let activeTokenId: string | undefined = undefined
    let plainToken: string | undefined = undefined

    if (params.newToken && params.newToken.trim()) {
      // Save new reusable PAT token encrypted with AES-256
      const tokenName = params.newTokenName || `${ownerRepo} PAT Token`
      const newTokenRecord = this.createToken(tokenName, provider, params.newToken.trim())
      activeTokenId = newTokenRecord.id
      plainToken = params.newToken.trim()
    } else if (params.tokenId && params.tokenId.trim()) {
      activeTokenId = params.tokenId.trim()
      plainToken = this.getDecryptedToken(activeTokenId)
    }

    const yamlContent = await this.fetchRawYaml(provider, ownerRepo, filePath, branch, plainToken)

    const now = new Date().toISOString()
    const fileName = `${ownerRepo.replace(/\//g, '-')}-${filePath.split('/').pop() || 'openapi.yaml'}`
    const specId = `git_${provider}_${ownerRepo.replace(/\//g, '_')}_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`

    const doc = await this.parser.parseYaml(yamlContent, specId, fileName)

    const gitSourceId = `scm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const displayName = params.name && params.name.trim() ? params.name.trim() : `${doc.title} (${provider === 'github' ? 'GitHub' : 'GitLab'})`

    // Check if Git source config already exists in SQLite
    const existing = db.select().from(gitSources).where(eq(gitSources.cachedSpecId, doc.id)).get()

    let record: GitSourceRecord

    if (existing) {
      db.update(gitSources)
        .set({
          name: displayName,
          repoUrl: params.repoUrl.trim(),
          filePath,
          branch,
          tokenId: activeTokenId || null,
          lastFetchedAt: now,
          updatedAt: now
        })
        .where(eq(gitSources.id, existing.id))
        .run()

      record = {
        ...existing,
        name: displayName,
        repoUrl: params.repoUrl.trim(),
        filePath,
        branch,
        tokenId: activeTokenId || null,
        lastFetchedAt: now,
        updatedAt: now
      }
    } else {
      const newRecord: GitSourceRecord = {
        id: gitSourceId,
        name: displayName,
        provider,
        repoUrl: params.repoUrl.trim(),
        filePath,
        branch,
        tokenId: activeTokenId || null,
        cachedSpecId: doc.id,
        lastFetchedAt: now,
        createdAt: now,
        updatedAt: now
      }

      db.insert(gitSources).values(newRecord).run()
      record = newRecord
    }

    return { doc, record }
  }

  /**
   * Sync / Refresh spec content from SCM for an existing spec ID
   */
  public async syncSpec(specId: string): Promise<{ doc: OpenApiDocument; record: GitSourceRecord }> {
    const existing = db.select().from(gitSources).where(eq(gitSources.cachedSpecId, specId)).get()

    if (!existing) {
      throw new StorageError(`No Git SCM configuration found in database for specification ID: ${specId}`)
    }

    const { provider, ownerRepo } = this.parseGitUrl(existing.repoUrl, existing.provider)
    let plainToken: string | undefined = undefined

    if (existing.tokenId) {
      plainToken = this.getDecryptedToken(existing.tokenId)
    }

    const yamlContent = await this.fetchRawYaml(
      provider,
      ownerRepo,
      existing.filePath,
      existing.branch,
      plainToken
    )

    const now = new Date().toISOString()
    const doc = await this.parser.parseYaml(yamlContent, existing.cachedSpecId)

    db.update(gitSources)
      .set({
        lastFetchedAt: now,
        updatedAt: now
      })
      .where(eq(gitSources.id, existing.id))
      .run()

    const updatedRecord: GitSourceRecord = {
      ...existing,
      lastFetchedAt: now,
      updatedAt: now
    }

    return { doc, record: updatedRecord }
  }

  /**
   * List all Git SCM records stored in SQLite
   */
  public listGitSources(): GitSourceRecord[] {
    return db.select().from(gitSources).all()
  }

  /**
   * Get Git SCM record for a specific spec ID
   */
  public getGitSourceBySpecId(specId: string): GitSourceRecord | undefined {
    return db.select().from(gitSources).where(eq(gitSources.cachedSpecId, specId)).get()
  }
}
