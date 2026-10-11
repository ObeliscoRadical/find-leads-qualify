import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ lead: { leadStatus: 'new', noContact: false }, duplicate: false, set: vi.fn(), values: vi.fn() }))
vi.mock('@/db', () => ({ getDb: () => ({ transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
  select: () => ({ from: () => ({ where: () => ({ for: async () => [mock.lead] }) }) }),
  insert: () => ({ values: (value: unknown) => { mock.values(value); return { returning: async () => [{ id: 'message' }], onConflictDoNothing: () => ({ returning: async () => mock.duplicate ? [] : [{ id: 'message' }] }) } } }),
  update: () => ({ set: (value: unknown) => { mock.set(value); return { where: async () => [] } } }),
}) }) }))
import { recordContactMessage, recordInstagramReply } from './contact-store'
const data = { organizationId: 'org', leadId: 'lead', content: 'Real', isFromLead: false }
beforeEach(() => { vi.clearAllMocks(); mock.duplicate = false; mock.lead = { leadStatus: 'new', noContact: false } })
it('advances to contacted only for recorded outgoing messages', async () => {
  await recordContactMessage(data)
  expect(mock.set).toHaveBeenCalledWith(expect.objectContaining({ leadStatus: 'contacted' }))
})
it('advances an actual reply to replied and preserves qualified/closed/opted_out states', async () => {
  for (const state of ['new', 'contacted', 'qualified', 'closed', 'opted_out']) {
    mock.lead.leadStatus = state
    await recordContactMessage({ ...data, isFromLead: true })
    expect(mock.set).toHaveBeenLastCalledWith(expect.objectContaining({ leadStatus: ['new', 'contacted'].includes(state) ? 'replied' : state }))
  }
})
it('checks restrictions again inside the locked transaction', async () => {
  mock.lead.noContact = true
  expect(await recordContactMessage(data)).toBeNull()
  expect(mock.values).not.toHaveBeenCalled()
})

it('imports real replies once, updates contacted state and respects restrictions', async () => {
  const reply = { username: 'empresa', content: 'Real answer', externalId: 'message-external-id' }
  mock.lead.leadStatus = 'contacted'
  expect(await recordInstagramReply('org', reply)).toEqual({ imported: true })
  expect(mock.values).toHaveBeenCalledWith(expect.objectContaining({ content: reply.content, instagramMessageId: reply.externalId, isFromLead: true }))
  expect(mock.set).toHaveBeenCalledWith(expect.objectContaining({ leadStatus: 'replied' }))
  mock.set.mockClear(); mock.duplicate = true
  expect(await recordInstagramReply('org', reply)).toEqual({ imported: false })
  expect(mock.set).not.toHaveBeenCalled()
  mock.lead.leadStatus = 'opted_out'
  expect(await recordInstagramReply('org', reply)).toBeNull()
  mock.lead.leadStatus = 'new'
  expect(await recordInstagramReply('org', reply)).toBeNull()
})
