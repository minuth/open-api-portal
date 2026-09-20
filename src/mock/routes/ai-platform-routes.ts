import crypto from 'node:crypto'
import { Hono } from 'hono'

export function createAiPlatformRoutes(): Hono {
  const router = new Hono()

  // 1. POST /api/v1/chat/completions
  router.post('/api/v1/chat/completions', async (c) => {
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    const model = String(body.model || 'cortex-chat-v2')
    const messages = Array.isArray(body.messages) ? body.messages : []
    const lastUserMessage = [...messages].reverse().find((m: unknown) => (m as { role: string })?.role === 'user')?.content || 'Hello!'

    const sampleAnswers: Record<string, string> = {
      default: `Zero-trust request signing commonly utilizes JSON Web Signatures (RFC 7515) with an asymmetric key (such as RS256 or ES256). The caller signs the HTTP payload and includes the detached signature and an RFC 3230 Digest header.`,
      greeting: `Hello! I am Cortex AI, ready to assist with API design, cryptography, and enterprise development.`,
      code: `\`\`\`json\n{\n  "status": "success",\n  "message": "Sample code generation completed"\n}\n\`\`\``
    }

    let responseContent = sampleAnswers.default
    if (String(lastUserMessage).toLowerCase().includes('hello') || String(lastUserMessage).toLowerCase().includes('hi')) {
      responseContent = sampleAnswers.greeting
    }

    return c.json({
      id: `chatcmpl_${crypto.randomBytes(6).toString('hex')}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: responseContent
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 18,
        completion_tokens: 54,
        total_tokens: 72
      }
    })
  })

  // 2. POST /api/v1/embeddings
  router.post('/api/v1/embeddings', async (c) => {
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    const model = String(body.model || 'text-embedding-3-small')
    const sampleVector = [
      0.0124, -0.0432, 0.0891, -0.0041, 0.0512, 0.0218, -0.0712, 0.0349, -0.0118, 0.0632
    ]

    return c.json({
      object: 'list',
      data: [
        {
          index: 0,
          embedding: sampleVector
        }
      ],
      model,
      usage: {
        prompt_tokens: 9,
        total_tokens: 9
      }
    })
  })

  // 3. GET /api/v1/models
  router.get('/api/v1/models', (c) => {
    return c.json({
      object: 'list',
      data: [
        {
          id: 'cortex-chat-v2',
          ownedBy: 'cortex-ai',
          contextWindow: 128000,
          supportsVision: true,
          supportsToolUse: true
        },
        {
          id: 'cortex-fast-mini',
          ownedBy: 'cortex-ai',
          contextWindow: 64000,
          supportsVision: false,
          supportsToolUse: true
        },
        {
          id: 'text-embedding-3-small',
          ownedBy: 'cortex-ai',
          contextWindow: 8192,
          supportsVision: false,
          supportsToolUse: false
        }
      ]
    })
  })

  // 4. GET /api/v1/usage
  router.get('/api/v1/usage', (c) => {
    return c.json({
      organizationId: 'org_cortex_enterprise_01',
      tier: 'Scale Tier 4',
      currentPeriodUsageTokens: 2450890,
      monthlyLimitTokens: 10000000,
      rateLimitRpm: 5000,
      balanceRemainingUsd: 412.5
    })
  })

  return router
}
