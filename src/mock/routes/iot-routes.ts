import crypto from 'node:crypto'
import { Hono } from 'hono'

export function createIotRoutes(): Hono {
  const router = new Hono()

  // 1. POST /api/v1/iot/telemetry
  router.post('/api/v1/iot/telemetry', async (c) => {
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    return c.json(
      {
        status: 'QUEUED',
        receivedRecords: 1,
        batchId: `bth_iot_${crypto.randomBytes(3).toString('hex')}`,
        serverTimestamp: new Date().toISOString()
      },
      202
    )
  })

  // 2. GET /api/v1/iot/devices
  router.get('/api/v1/iot/devices', (c) => {
    const zone = c.req.query('zone') || 'Zone-North-Plant'
    const status = c.req.query('status') || 'online'

    return c.json({
      count: 2,
      devices: [
        {
          id: 'dev_edge_8012',
          model: 'PulseNode-TX500',
          zone,
          firmwareVersion: 'v3.4.1-rc2',
          status,
          lastHeartbeat: new Date().toISOString()
        },
        {
          id: 'dev_edge_8015',
          model: 'PulseNode-TX500',
          zone,
          firmwareVersion: 'v3.4.0',
          status,
          lastHeartbeat: new Date(Date.now() - 60000).toISOString()
        }
      ]
    })
  })

  // 3. GET /api/v1/iot/devices/:deviceId/shadow
  router.get('/api/v1/iot/devices/:deviceId/shadow', (c) => {
    const deviceId = c.req.param('deviceId')
    return c.json({
      deviceId,
      version: 142,
      state: {
        desired: {
          samplingRateSeconds: 5,
          logLevel: 'WARN',
          telemetryEnabled: true
        },
        reported: {
          samplingRateSeconds: 5,
          logLevel: 'WARN',
          telemetryEnabled: true,
          batteryHealth: 'EXCELLENT'
        }
      },
      lastSyncedAt: new Date().toISOString()
    })
  })

  // 4. POST /api/v1/iot/devices/:deviceId/commands
  router.post('/api/v1/iot/devices/:deviceId/commands', async (c) => {
    const deviceId = c.req.param('deviceId')
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    return c.json({
      commandId: `cmd_act_${crypto.randomBytes(3).toString('hex')}`,
      deviceId,
      command: body.command || 'calibrate_sensors',
      status: 'ACKNOWLEDGED',
      dispatchedAt: new Date().toISOString()
    })
  })

  return router
}
