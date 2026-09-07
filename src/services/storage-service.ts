import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  IStorageProvider,
  ISpecParser,
  OpenApiDocument,
  SpecSummary
} from '../types/openapi'
import { StorageError } from '../types/errors'

export class LocalStorageProvider implements IStorageProvider {
  private readonly storageDir: string
  private readonly parser: ISpecParser

  constructor(parser: ISpecParser, storageDir = './storage/specs') {
    this.storageDir = path.resolve(process.cwd(), storageDir)
    this.parser = parser
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true })
    } catch (err: unknown) {
      throw new StorageError(`Failed to create storage directory: ${String(err)}`)
    }
  }

  public async saveSpec(filename: string, yamlContent: string, _userId?: string): Promise<OpenApiDocument> {
    await this.ensureDirectory()
    const sanitizedFilename = filename.endsWith('.yaml') || filename.endsWith('.yml')
      ? filename
      : `${filename}.yaml`

    const specId = sanitizedFilename.replace(/\.(yaml|yml)$/i, '')
    const doc = await this.parser.parseYaml(yamlContent, specId, filename)

    const filePath = path.join(this.storageDir, `${specId}.yaml`)
    try {
      await fs.writeFile(filePath, yamlContent, 'utf-8')
    } catch (err: unknown) {
      throw new StorageError(`Failed to save spec to file: ${String(err)}`)
    }

    return doc
  }

  public async getSpec(id: string, _userId?: string): Promise<OpenApiDocument | null> {
    await this.ensureDirectory()
    const filePath = path.join(this.storageDir, `${id}.yaml`)
    try {
      const yamlContent = await fs.readFile(filePath, 'utf-8')
      return await this.parser.parseYaml(yamlContent, id)
    } catch {
      return null
    }
  }

  public async listSpecs(_userId?: string): Promise<SpecSummary[]> {
    await this.ensureDirectory()
    try {
      const files = await fs.readdir(this.storageDir)
      const summaries: SpecSummary[] = []

      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const specId = file.replace(/\.(yaml|yml)$/i, '')
          const doc = await this.getSpec(specId)
          if (doc) {
            summaries.push({
              id: doc.id,
              title: doc.title,
              version: doc.version,
              description: doc.description,
              endpointCount: doc.endpoints.length,
              isTemporary: false,
              createdAt: doc.createdAt
            })
          }
        }
      }

      return summaries
    } catch (err: unknown) {
      throw new StorageError(`Failed to list specs: ${String(err)}`)
    }
  }

  public async deleteSpec(id: string, _userId?: string): Promise<boolean> {
    await this.ensureDirectory()
    const filePath = path.join(this.storageDir, `${id}.yaml`)
    try {
      await fs.unlink(filePath)
      return true
    } catch {
      return false
    }
  }
}

export class MemoryStorageProvider implements IStorageProvider {
  private readonly memoryMap = new Map<string, OpenApiDocument>()
  private readonly parser: ISpecParser

  constructor(parser: ISpecParser) {
    this.parser = parser
  }

  public async saveSpec(filename: string, yamlContent: string, userId?: string): Promise<OpenApiDocument> {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const doc = await this.parser.parseYaml(yamlContent, tempId, filename)
    doc.isTemporary = true
    doc.userId = userId

    this.memoryMap.set(tempId, doc)
    return doc
  }

  public async getSpec(id: string, userId?: string): Promise<OpenApiDocument | null> {
    const doc = this.memoryMap.get(id)
    if (!doc) return null

    // If sandbox doc belongs to a specific user, enforce user isolation
    if (doc.userId && userId && doc.userId !== userId) {
      return null
    }

    return doc
  }

  public async listSpecs(userId?: string): Promise<SpecSummary[]> {
    const summaries: SpecSummary[] = []
    for (const doc of this.memoryMap.values()) {
      // Filter out sandbox files belonging to other users
      if (doc.userId && userId && doc.userId !== userId) {
        continue
      }
      summaries.push({
        id: doc.id,
        title: doc.title,
        version: doc.version,
        description: doc.description,
        endpointCount: doc.endpoints.length,
        isTemporary: true,
        userId: doc.userId,
        createdAt: doc.createdAt
      })
    }
    return summaries
  }

  public async deleteSpec(id: string, userId?: string): Promise<boolean> {
    const doc = this.memoryMap.get(id)
    if (!doc) return false

    if (doc.userId && userId && doc.userId !== userId) {
      return false
    }

    return this.memoryMap.delete(id)
  }
}
