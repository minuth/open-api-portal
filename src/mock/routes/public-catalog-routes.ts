import { Hono } from 'hono'

export function createPublicCatalogRoutes(): Hono {
  const router = new Hono()

  // 1. GET /api/public/weather/current
  router.get('/api/public/weather/current', (c) => {
    const city = c.req.query('city') || 'Tokyo'
    const units = c.req.query('units') || 'metric'
    const isImperial = units === 'imperial'

    return c.json({
      city,
      country: city.toLowerCase() === 'tokyo' ? 'Japan' : 'United States',
      coordinates: {
        lat: city.toLowerCase() === 'tokyo' ? 35.6762 : 40.7128,
        lon: city.toLowerCase() === 'tokyo' ? 139.6503 : -74.006
      },
      temperature: isImperial ? 72.3 : 22.4,
      feelsLike: isImperial ? 71.2 : 21.8,
      condition: 'Partly Cloudy',
      humidity: 58,
      windSpeedKmh: isImperial ? 8.8 : 14.2,
      uvIndex: 4,
      recordedAt: new Date().toISOString()
    })
  })

  // 2. GET /api/public/weather/forecast
  router.get('/api/public/weather/forecast', (c) => {
    const city = c.req.query('city') || 'Tokyo'
    const days = Math.min(Math.max(Number(c.req.query('days')) || 5, 1), 7)

    const conditions = ['Sunny', 'Partly Cloudy', 'Scattered Showers', 'Clear Sky', 'Breezy']
    const forecasts = Array.from({ length: days }, (_, i) => {
      const dateObj = new Date()
      dateObj.setDate(dateObj.getDate() + (i + 1))
      return {
        date: dateObj.toISOString().split('T')[0],
        dayOfWeek: dateObj.toLocaleDateString('en-US', { weekday: 'long' }),
        tempMin: 17 + i,
        tempMax: 24 + i,
        condition: conditions[i % conditions.length],
        rainProbability: (i * 15) % 80
      }
    })

    return c.json({
      city,
      country: 'Global Directory',
      daysCount: days,
      forecasts
    })
  })

  // 3. GET /api/public/cities
  router.get('/api/public/cities', (c) => {
    const search = (c.req.query('search') || '').toLowerCase()
    const page = Math.max(Number(c.req.query('page')) || 1, 1)
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 10, 1), 50)

    const allCities = [
      { id: 'tokyo-jp', name: 'Tokyo', country: 'Japan', population: 13960000, timezone: 'Asia/Tokyo' },
      { id: 'san-francisco-us', name: 'San Francisco', country: 'United States', population: 873965, timezone: 'America/Los_Angeles' },
      { id: 'london-gb', name: 'London', country: 'United Kingdom', population: 8982000, timezone: 'Europe/London' },
      { id: 'singapore-sg', name: 'Singapore', country: 'Singapore', population: 5686000, timezone: 'Asia/Singapore' },
      { id: 'paris-fr', name: 'Paris', country: 'France', population: 2161000, timezone: 'Europe/Paris' },
      { id: 'san-diego-us', name: 'San Diego', country: 'United States', population: 1386934, timezone: 'America/Los_Angeles' },
      { id: 'sydney-au', name: 'Sydney', country: 'Australia', population: 5312000, timezone: 'Australia/Sydney' }
    ]

    const filtered = search ? allCities.filter((city) => city.name.toLowerCase().includes(search)) : allCities
    const startIndex = (page - 1) * limit
    const paginated = filtered.slice(startIndex, startIndex + limit)

    return c.json({
      page,
      limit,
      total: filtered.length,
      items: paginated
    })
  })

  // 4. GET /api/public/cities/:cityId
  router.get('/api/public/cities/:cityId', (c) => {
    const cityId = c.req.param('cityId')
    return c.json({
      id: cityId,
      name: cityId.replace(/-[a-z]{2}$/i, '').replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      country: 'Global Directory',
      countryCode: cityId.slice(-2).toUpperCase(),
      coordinates: { lat: 35.6762, lon: 139.6503 },
      elevationMeters: 42,
      population: 8500000,
      timezone: 'UTC',
      description: 'Major global municipal and commercial metropolitan hub.'
    })
  })

  // 5. GET /api/public/events
  router.get('/api/public/events', (c) => {
    const category = c.req.query('category') || 'all'
    const events = [
      {
        id: 'evt_88192',
        title: 'Global Open Source & API Developer Summit 2026',
        category: 'technology',
        venue: 'International Convention Center',
        date: '2026-10-15',
        isFree: true
      },
      {
        id: 'evt_88193',
        title: 'Autumn Symphony & Acoustic Concert in the Park',
        category: 'music',
        venue: 'Central Amphitheater',
        date: '2026-10-22',
        isFree: true
      },
      {
        id: 'evt_88194',
        title: 'Metropolitan Art & Heritage Biennial',
        category: 'culture',
        venue: 'Municipal Gallery of Modern Art',
        date: '2026-11-05',
        isFree: false
      }
    ]

    const filtered = category === 'all' ? events : events.filter((e) => e.category === category)
    return c.json({ count: filtered.length, events: filtered })
  })

  // 6. GET /api/public/status
  router.get('/api/public/status', (c) => {
    return c.json({
      status: 'OPERATIONAL',
      uptimePercentage: 99.98,
      activeStations: 18450,
      lastUpdated: new Date().toISOString()
    })
  })

  return router
}
