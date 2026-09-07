import {
  IProxyDispatcher,
  ProxyRequestParams,
  ProxyResponseResult
} from '../types/openapi'
import { ProxyTimeoutError } from '../types/errors'

export class ApiExecutorService implements IProxyDispatcher {
  private readonly defaultTimeoutMs: number

  constructor(defaultTimeoutMs = 15000) {
    this.defaultTimeoutMs = defaultTimeoutMs
  }

  public async execute(params: ProxyRequestParams): Promise<ProxyResponseResult> {
    const { targetUrl, method, headers = {}, queryParams = {}, body } = params

    const urlObj = new URL(targetUrl)
    for (const [key, val] of Object.entries(queryParams)) {
      if (val !== undefined && val !== null && val !== '') {
        urlObj.searchParams.append(key, val)
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeoutMs)

    const reqHeaders: Record<string, string> = { ...headers }
    if (body && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json'
    }

    const startTime = performance.now()

    try {
      const response = await fetch(urlObj.toString(), {
        method: method.toUpperCase(),
        headers: reqHeaders,
        body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
        signal: controller.signal
      })

      const endTime = performance.now()
      clearTimeout(timeoutId)

      const latencyMs = Math.round(endTime - startTime)
      const responseText = await response.text()
      const contentType = response.headers.get('content-type') || 'text/plain'

      const respHeaders: Record<string, string> = {}
      response.headers.forEach((val, key) => {
        respHeaders[key] = val
      })

      return {
        statusCode: response.status,
        statusText: response.statusText,
        headers: respHeaders,
        body: responseText,
        latencyMs,
        contentType
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProxyTimeoutError(urlObj.toString(), this.defaultTimeoutMs)
      }
      throw err
    }
  }
}
