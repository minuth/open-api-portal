export class DomainError extends Error {
  public readonly statusCode: number
  
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class InvalidSpecError extends DomainError {
  constructor(message: string) {
    super(`Invalid OpenAPI Spec: ${message}`, 400)
  }
}

export class StorageError extends DomainError {
  constructor(message: string) {
    super(`Storage Error: ${message}`, 500)
  }
}

export class SpecNotFoundError extends DomainError {
  constructor(specId: string) {
    super(`Specification '${specId}' not found`, 404)
  }
}

export class ProxyTimeoutError extends DomainError {
  constructor(targetUrl: string, timeoutMs: number) {
    super(`Target URL '${targetUrl}' timed out after ${timeoutMs}ms`, 504)
  }
}

export class JoseCryptoError extends DomainError {
  constructor(message: string) {
    super(`JOSE Cryptography Error: ${message}`, 400)
  }
}

export class InvalidJoseSpecError extends DomainError {
  constructor(message: string) {
    super(`Invalid x-jose-security definition: ${message}`, 400)
  }
}

