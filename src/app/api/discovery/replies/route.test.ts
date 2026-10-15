import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ requireWorker: vi.fn(), recordInstagramReply: vi.fn() }))
vi.mock('@/lib/discovery/auth', () => mock)
vi.mock('@/lib/leads/contact-store', () => mock)
import { POST } from './route'
const data = { receivedAt:new Date().toISOString(), username: 'Empresa.pt', content: 'Olá, pode enviar proposta?', externalId: 'thread123-msg456', threadUrl: 'https://www.instagram.com/direct/t/123/' }
const request = (value = data) => new Request('https://app.test/api/discovery/replies', { method: 'POST', body: JSON.stringify(value) })
beforeEach(() => { vi.clearAllMocks(); mock.requireWorker.mockResolvedValue({ organizationId: 'org' }); mock.recordInstagramReply.mockResolvedValue({ imported: true }) })
it('requires a paired worker before reading replies', async () => {
  mock.requireWorker.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(401)
  expect(mock.recordInstagramReply).not.toHaveBeenCalled()
})
it('imports actual content into worker organization and normalizes username', async () => {
  expect((await POST(request())).status).toBe(200)
  expect(mock.recordInstagramReply).toHaveBeenCalledWith('org', expect.objectContaining({ username: 'empresa.pt', content: data.content, externalId: data.externalId }))
})
it('rejects unrelated URLs and empty messages', async () => {
  expect((await POST(request({ ...data, threadUrl: 'https://evil.test/direct/t/123/' }))).status).toBe(422)
  expect((await POST(request({ ...data, content: ' ' }))).status).toBe(422)
  expect(mock.recordInstagramReply).not.toHaveBeenCalled()
})
it('rejects unmonitored or opted out lead and acknowledges deduplication', async () => {
  mock.recordInstagramReply.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(409)
  mock.recordInstagramReply.mockResolvedValue({ imported: false })
  expect(await (await POST(request())).json()).toEqual({ imported: false })
})

it('accepts anchored observation but rejects missing time or incomplete proof',async () => {
  const {receivedAt,...base}=data
  expect((await POST(request(base as typeof data))).status).toBe(422)
  const observed={...base,externalId:'ig-sequence-v1:'+ 'a'.repeat(64),observedAt:new Date().toISOString(),receivedAfter:new Date(Date.now()-60000).toISOString(),anchorMessageId:'msg_outreach_anchor',timestampEstimated:true,sequenceOrdinal:1}
  expect((await POST(request(observed as unknown as typeof data))).status).toBe(200)
  expect(mock.recordInstagramReply).toHaveBeenLastCalledWith('org',expect.objectContaining({timestampEstimated:true,anchorMessageId:'msg_outreach_anchor'}))
  expect((await POST(request({...observed,anchorMessageId:undefined} as unknown as typeof data))).status).toBe(422)
})
