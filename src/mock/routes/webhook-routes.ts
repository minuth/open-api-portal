import crypto from 'node:crypto'
import { Hono } from 'hono'

export function createWebhookRoutes(): Hono {
  const router = new Hono()

  // 1. GET /api/v1/webhooks/subscriptions
  router.get('/api/v1/webhooks/subscriptions', (c) => {
    return c.json({
      count: 2,
      subscriptions: [
        {
          id: 'sub_wh_88192',
          url: 'https://api.partner.example/webhooks/relaygrid',
          events: ['payment.succeeded', 'order.fulfilled'],
          signingSecretPrefix: 'whsec_9941...',
          status: 'ACTIVE',
          createdAt: '2026-08-01T10:00:00Z'
        },
        {
          id: 'sub_wh_88193',
          url: 'https://ops-gateway.internal.example/events',
          events: ['device.offline', 'security.alert'],
          signingSecretPrefix: 'whsec_8820...',
          status: 'ACTIVE',
          createdAt: '2026-08-15T12:30:00Z'
        }
      ]
    })
  })

  // 2. POST /api/v1/webhooks/subscriptions
  router.post('/api/v1/webhooks/subscriptions', async (c) => {
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    const subId = `sub_wh_${crypto.randomBytes(3).toString('hex')}`
    return c.json(
      {
        id: subId,
        url: body.url || 'https://api.partner.example/webhooks/relaygrid',
        events: body.events || ['payment.succeeded'],
        signingSecretPrefix: 'whsec_new_...',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      },
      201
    )
  })

  // 3. DELETE /api/v1/webhooks/subscriptions/:subscriptionId
  router.delete('/api/v1/webhooks/subscriptions/:subscriptionId', (c) => {
    const subscriptionId = c.req.param('subscriptionId')
    return c.json({ deleted: true, subscriptionId })
  })

  // 4. POST /api/v1/webhooks/test-ping
  router.post('/api/v1/webhooks/test-ping', async (c) => {
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    const targetUrl = String(body.targetUrl || 'https://webhook.site/sample-receiver')
    const secret = String(body.secret || 'whsec_demo_secret_2026')
    const eventType = String(body.eventType || 'payment.succeeded')

    const samplePayload = JSON.stringify({
      event: eventType,
      eventId: `evt_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      data: { amount: 450.0, currency: 'USD', customerId: 'cust_8812' }
    })

    const signature = crypto.createHmac('sha256', secret).update(samplePayload).digest('hex')

    return c.json({
      delivered: true,
      targetUrl,
      generatedSignature: `sha256=${signature}`,
      httpStatusReceived: 200,
      roundTripLatencyMs: 114
    })
  })

  // 5. GET /api/v1/webhooks/deliveries
  router.get('/api/v1/webhooks/deliveries', (c) => {
    return c.json({
      total: 3,
      deliveries: [
        {
          id: 'del_88192a',
          subscriptionId: 'sub_wh_88192',
          eventType: 'payment.succeeded',
          payloadId: 'evt_pay_7721',
          responseStatusCode: 200,
          latencyMs: 84,
          timestamp: new Date(Date.now() - 120000).toISOString(),
          attemptNumber: 1
        },
        {
          id: 'del_88192b',
          subscriptionId: 'sub_wh_88192',
          eventType: 'order.fulfilled',
          payloadId: 'evt_ord_9901',
          responseStatusCode: 200,
          latencyMs: 95,
          timestamp: new Date(Date.now() - 360000).toISOString(),
          attemptNumber: 1
        },
        {
          id: 'del_88192c',
          subscriptionId: 'sub_wh_88193',
          eventType: 'device.offline',
          payloadId: 'evt_dev_4412',
          responseStatusCode: 504,
          latencyMs: 5000,
          timestamp: new Date(Date.now() - 600000).toISOString(),
          attemptNumber: 3
        }
      ]
    })
  })

  return router
}
