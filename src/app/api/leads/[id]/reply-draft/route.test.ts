import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), lead: vi.fn(), getDraft: vi.fn(), prepare: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ requireAuth: mocks.auth }))
vi.mock('@/db/queries', () => ({ getLeadById: mocks.lead }))
vi.mock('@/lib/replies/draft', () => ({ getFirstReplyDraft: mocks.getDraft, prepareFirstReply: mocks.prepare }))
vi.mock('@/lib/rate-limit', () => ({ applyRateLimit: () => ({ response: null }), getClientIdentifier: () => 'test', limiters: { leadsCreate: {} } }))
import { GET, POST } from './route'
const context = { params: Promise.resolve({ id: 'lead-a' }) }
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ session: { organizationId: 'org-a' } }); mocks.lead.mockResolvedValue({ id: 'lead-a' }) })
it('requires authentication before reading or preparing any conversation', async () => {
  mocks.auth.mockResolvedValue(null)
  expect((await GET(new Request('http://localhost'), context)).status).toBe(401)
  expect((await POST(new Request('http://localhost', { method: 'POST' }), context)).status).toBe(401)
  expect(mocks.getDraft).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled()
})
it('does not expose or generate a draft for another organization lead', async () => {
  mocks.lead.mockResolvedValue(null)
  expect((await GET(new Request('http://localhost'), context)).status).toBe(404)
  expect((await POST(new Request('http://localhost', { method: 'POST' }), context)).status).toBe(404)
  expect(mocks.getDraft).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled()
})
it('returns a prepared draft as not sent with no cached conversation data', async () => {
  const draft = { content: 'Uma pergunta? https://obeliscoradical.pt', deliveryStatus: 'not_sent' }
  mocks.prepare.mockResolvedValue({ status: 'prepared', draft })
  const response = await POST(new Request('http://localhost', { method: 'POST' }), context)
  expect(await response.json()).toEqual({ status: 'prepared', draft })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(mocks.prepare).toHaveBeenCalledWith('org-a', 'lead-a')
})
it('does not expose provider errors or claim delivery when AI fails', async () => {
  mocks.prepare.mockRejectedValue(new Error('secret-provider-error'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const response = await POST(new Request('http://localhost', { method: 'POST' }), context)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret-provider-error')
  log.mockRestore()
})
