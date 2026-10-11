import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const store = vi.hoisted(() => ({ pageConnections: vi.fn(), captureLead: vi.fn() }))
vi.mock('@/lib/meta/capture-store', () => store)
const messaging = vi.hoisted(() => ({ingestInstagramEvent:vi.fn()}))
vi.mock('@/lib/meta/messaging', () => messaging)
import { GET, POST } from './route'
import { resetEnvCache } from '@/lib/env'
function eventRequest(value: unknown, signed = true) {
  const body = JSON.stringify(value)
  return new Request('https://example.com/api/webhooks/meta', { method: 'POST', body, headers: signed ? { 'x-hub-signature-256': `sha256=${createHmac('sha256', 'test-app-secret').update(body).digest('hex')}` } : {} })
}
const event = { object: 'page', entry: [{ id: '10', changes: [{ field: 'leadgen', value: { page_id: '10', leadgen_id: '123' } }] }] }
beforeEach(() => { vi.clearAllMocks(); resetEnvCache(); vi.stubEnv('META_WEBHOOK_VERIFY_TOKEN', 'a'.repeat(32)) })
describe('Meta lead webhook', () => {
  it('verifies challenge only with the configured verification token', async () => {
    const url = 'https://example.com/api/webhooks/meta?hub.mode=subscribe&hub.challenge=123&hub.verify_token='
    expect(await (await GET(new Request(url + 'a'.repeat(32)))).text()).toBe('123')
    expect((await GET(new Request(url + 'wrong'))).status).toBe(403)
  })
  it('rejects unsigned events before accessing any tenant data', async () => {
    expect((await POST(eventRequest(event, false))).status).toBe(403)
    expect(store.pageConnections).not.toHaveBeenCalled()
  })
  it('routes only to connections matching the signed page ID', async () => {
    const connection = { organizationId: 'owner' }
    store.pageConnections.mockResolvedValue([connection])
    store.captureLead.mockResolvedValue(true)
    expect((await POST(eventRequest(event))).status).toBe(200)
    expect(store.pageConnections).toHaveBeenCalledWith('10')
    expect(store.captureLead).toHaveBeenCalledWith(connection, '123')
  })
  it('rejects inconsistent page IDs', async () => {
    expect((await POST(eventRequest({ object: 'page', entry: [{ id: '11', changes: event.entry[0].changes }] }))).status).toBe(400)
    expect(store.captureLead).not.toHaveBeenCalled()
  })
  it('requests a retry when import fails, rather than acknowledging lost leads', async () => {
    store.pageConnections.mockResolvedValue([{ organizationId: 'owner' }])
    store.captureLead.mockRejectedValue(new Error('Database unavailable'))
    expect((await POST(eventRequest(event))).status).toBe(503)
  })
})

describe('signed Instagram inbox webhook', () => {
  const incoming = {object:'instagram',entry:[{id:'17841442395563501',messaging:[{sender:{id:'123'},recipient:{id:'17841442395563501'},timestamp:1720000000000,message:{mid:'m_real',text:'Quero saber mais'}}]}]}
  it('does not route an unsigned message', async () => {
    expect((await POST(eventRequest(incoming,false))).status).toBe(403)
    expect(messaging.ingestInstagramEvent).not.toHaveBeenCalled()
  })
  it('routes signed events by the linked recipient account', async () => {
    expect((await POST(eventRequest(incoming))).status).toBe(200)
    expect(messaging.ingestInstagramEvent).toHaveBeenCalledWith('17841442395563501',incoming.entry[0].messaging[0])
    expect(store.captureLead).not.toHaveBeenCalled()
  })
  it('requests retry on storage failure', async () => {
    messaging.ingestInstagramEvent.mockRejectedValueOnce(new Error('database'))
    expect((await POST(eventRequest(incoming))).status).toBe(503)
  })
})
