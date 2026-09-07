import { SpecParserService } from './spec-parser'
import { LocalStorageProvider, MemoryStorageProvider } from './storage-service'
import { ScmService } from './scm-service'

export const parserService = new SpecParserService()
export const localStorageProvider = new LocalStorageProvider(parserService)
export const memoryStorageProvider = new MemoryStorageProvider(parserService)
export const scmService = new ScmService(parserService)
