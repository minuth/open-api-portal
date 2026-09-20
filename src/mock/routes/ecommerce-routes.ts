import crypto from 'node:crypto'
import { Hono } from 'hono'

export function createEcommerceRoutes(): Hono {
  const router = new Hono()

  // 1. GET /api/v2/products
  router.get('/api/v2/products', (c) => {
    const category = c.req.query('category') || 'electronics'
    const limit = Math.min(Number(c.req.query('limit')) || 10, 50)

    const products = [
      {
        id: 'prod_88219',
        title: 'Wireless Noise-Cancelling Pro Headphones',
        sku: 'SKU-NOISE-CANCEL-PRO',
        category: 'electronics',
        price: 249.99,
        currency: 'USD',
        stockQuantity: 142,
        rating: 4.8,
        createdAt: '2026-08-10T14:20:00Z'
      },
      {
        id: 'prod_88220',
        title: 'Ultra-Compact USB-C Fast Charger 65W',
        sku: 'SKU-CHARGER-65W',
        category: 'electronics',
        price: 39.99,
        currency: 'USD',
        stockQuantity: 580,
        rating: 4.9,
        createdAt: '2026-08-15T09:10:00Z'
      },
      {
        id: 'prod_88221',
        title: 'Ergonomic Split Mechanical Keyboard',
        sku: 'SKU-MECH-KEY-SPLIT',
        category: 'electronics',
        price: 189.5,
        currency: 'USD',
        stockQuantity: 64,
        rating: 4.7,
        createdAt: '2026-08-20T11:45:00Z'
      }
    ]

    const filtered = category === 'all' ? products : products.filter((p) => p.category === category)
    return c.json({ total: filtered.length, items: filtered.slice(0, limit) })
  })

  // 2. POST /api/v2/products
  router.post('/api/v2/products', async (c) => {
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    const newId = `prod_${crypto.randomBytes(4).toString('hex')}`
    const product = {
      id: newId,
      title: body.title || 'New Store Catalog Item',
      sku: body.sku || `SKU-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      category: body.category || 'electronics',
      price: Number(body.price) || 99.99,
      currency: body.currency || 'USD',
      stockQuantity: Number(body.stockQuantity) || 100,
      rating: 5.0,
      createdAt: new Date().toISOString()
    }

    c.header('Location', `/api/v2/products/${newId}`)
    return c.json(product, 201)
  })

  // 3. GET /api/v2/products/:productId
  router.get('/api/v2/products/:productId', (c) => {
    const productId = c.req.param('productId')
    return c.json({
      id: productId,
      title: 'Wireless Noise-Cancelling Pro Headphones',
      sku: 'SKU-NOISE-CANCEL-PRO',
      category: 'electronics',
      price: 249.99,
      currency: 'USD',
      stockQuantity: 142,
      rating: 4.8,
      createdAt: '2026-08-10T14:20:00Z'
    })
  })

  // 4. PUT /api/v2/products/:productId
  router.put('/api/v2/products/:productId', async (c) => {
    const productId = c.req.param('productId')
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    return c.json({
      id: productId,
      title: body.title || 'Wireless Noise-Cancelling Pro Headphones (Updated)',
      sku: 'SKU-NOISE-CANCEL-PRO',
      category: 'electronics',
      price: Number(body.price) || 229.99,
      currency: 'USD',
      stockQuantity: Number(body.stockQuantity) || 180,
      rating: 4.8,
      updatedAt: new Date().toISOString()
    })
  })

  // 5. DELETE /api/v2/products/:productId
  router.delete('/api/v2/products/:productId', (c) => {
    const productId = c.req.param('productId')
    return c.json({ deleted: true, productId })
  })

  // 6. GET /api/v2/orders
  router.get('/api/v2/orders', (c) => {
    const status = c.req.query('status') || 'processing'
    return c.json({
      count: 1,
      orders: [
        {
          id: 'ord_771923',
          customerId: 'cust_9941',
          status,
          totalAmount: 289.49,
          currency: 'USD',
          items: [{ productId: 'prod_88219', quantity: 1, unitPrice: 249.99 }],
          shippingAddress: {
            street: '742 Evergreen Terrace',
            city: 'Springfield',
            zip: '97477',
            country: 'US'
          },
          trackingNumber: 'TRK-FEDEX-99881234',
          createdAt: '2026-09-18T09:12:00Z'
        }
      ]
    })
  })

  // 7. POST /api/v2/orders
  router.post('/api/v2/orders', async (c) => {
    let body: Record<string, unknown> = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    const orderId = `ord_${crypto.randomBytes(4).toString('hex')}`
    return c.json(
      {
        id: orderId,
        customerId: body.customerId || 'cust_9941',
        status: 'processing',
        totalAmount: 249.99,
        currency: 'USD',
        items: body.items || [{ productId: 'prod_88219', quantity: 1, unitPrice: 249.99 }],
        shippingMethod: body.shippingMethod || 'express',
        trackingNumber: `TRK-EXPRESS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        createdAt: new Date().toISOString()
      },
      201
    )
  })

  // 8. GET /api/v2/orders/:orderId
  router.get('/api/v2/orders/:orderId', (c) => {
    const orderId = c.req.param('orderId')
    return c.json({
      id: orderId,
      customerId: 'cust_9941',
      status: 'processing',
      totalAmount: 289.49,
      currency: 'USD',
      items: [{ productId: 'prod_88219', quantity: 1, unitPrice: 249.99 }],
      shippingAddress: {
        street: '742 Evergreen Terrace',
        city: 'Springfield',
        zip: '97477',
        country: 'US'
      },
      trackingNumber: 'TRK-FEDEX-99881234',
      createdAt: '2026-09-18T09:12:00Z'
    })
  })

  // 9. GET /api/v2/inventory/:sku
  router.get('/api/v2/inventory/:sku', (c) => {
    const sku = c.req.param('sku')
    return c.json({
      sku,
      available: 142,
      reserved: 18,
      incoming: 50,
      warehouseLocation: 'WH-NORTH-BAY-A12'
    })
  })

  return router
}
