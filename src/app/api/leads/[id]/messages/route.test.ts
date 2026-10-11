import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getLeadById: vi.fn(), getLeadMessages: vi.fn(), recordContactMessage: vi.fn() }))
vi.mock('@/db/queries', () => mocks)
vi.mock('@/lib/leads/contact-store', () => mocks)
vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ session: { organizationId: 'org' } })) }))
vi.mock('@/lib/rate-limit', () => ({ limiters: {}, getClientIdentifier: () => 'test', applyRateLimit: () => ({ result: { remaining: 10 } }) }))
import { POST } from './route'
const context = { params: Promise.resolve({ id: 'lead' }) }
function request(extra = {}) { return new Request('https://app.test/api/leads/lead/messages', { method: 'POST', body: JSON.stringify({ content: 'Texto real', confirmedSent: true, ...extra }) }) }
beforeEach(() => { vi.clearAllMocks(); mocks.getLeadById.mockResolvedValue({ noContact: false, leadStatus: 'new' }); mocks.recordContactMessage.mockResolvedValue({ id: 'message' }) })
it('blocks outgoing records for noContact and opt out leads', async () => {
  for (const lead of [{ noContact: true, leadStatus: 'new' }, { noContact: false, leadStatus: 'opted_out' }]) {
    mocks.getLeadById.mockResolvedValue(lead)
    expect((await POST(request(), context)).status).toBe(409)
  }
  expect(mocks.recordContactMessage).not.toHaveBeenCalled()
})
it('requires an actual-send confirmation and rejects API delivery claims', async () => {
  expect((await POST(request({ confirmedSent: false }), context)).status).toBe(400)
  expect((await POST(request({ sentVia: 'api' }), context)).status).toBe(400)
  expect(mocks.recordContactMessage).not.toHaveBeenCalled()
})
it('records manually and makes the delivery limitation explicit', async () => {
  const response = await POST(request(), context)
  expect(response.status).toBe(201)
  expect((await response.json()).delivery).toBe('recorded_manually')
  expect(mocks.recordContactMessage).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org', leadId: 'lead', content: 'Texto real' }))
})
it('allows a real incoming reply without removing opt out restrictions', async () => {
  mocks.getLeadById.mockResolvedValue({ noContact: true, leadStatus: 'opted_out' })
  expect((await POST(request({ isFromLead: true, confirmedSent: false }), context)).status).toBe(201)
})
it('handles a lead blocked between request check and transaction', async () => {
  mocks.recordContactMessage.mockResolvedValue(null)
  expect((await POST(request(), context)).status).toBe(409)
})
