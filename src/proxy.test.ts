import { expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

it('passes the exact worker routes to their own scoped authentication', async () => {
  for (const path of ['/api/discovery/worker', '/api/outreach/worker']) {
    const result = await proxy(new NextRequest(`https://app.test${path}`, {
      headers: { authorization: 'Bearer worker-token' },
    }))
    expect(result.headers.get('x-middleware-next')).toBe('1')
    expect(result.headers.get('x-user-id')).toBeNull()
  }
})

it('keeps outreach configuration and lookalike routes behind session authentication', async () => {
  for (const path of ['/api/outreach', '/api/outreach/worker-extra', '/api/outreach/worker/nested']) {
    const result = await proxy(new NextRequest(`https://app.test${path}`, {
      headers: { authorization: 'Bearer worker-token' },
    }))
    expect(result.status).toBe(401)
    expect(await result.json()).toEqual({ error: 'Não autorizado.' })
  }
})
