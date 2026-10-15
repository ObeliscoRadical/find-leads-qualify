import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ requireWorker:vi.fn(),prepareFirstReply:vi.fn() }))
vi.mock('@/lib/discovery/auth',() => mocks)
vi.mock('@/lib/replies/draft',() => mocks)
import { POST } from './route'
const request = () => new Request('https://app.test/api/discovery/replies/draft',{method:'POST',body:JSON.stringify({leadId:'lead'})})
beforeEach(() => vi.clearAllMocks())
it('rejects missing or invalid worker before generating anything',async () => {
  mocks.requireWorker.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(401)
  expect(mocks.prepareFirstReply).not.toHaveBeenCalled()
})
it('uses authenticated organisation and clearly returns a prepared draft',async () => {
  mocks.requireWorker.mockResolvedValue({organizationId:'org'})
  mocks.prepareFirstReply.mockResolvedValue({status:'prepared',draft:{deliveryStatus:'not_sent',content:'CTA'}})
  const response = await POST(request())
  expect(mocks.prepareFirstReply).toHaveBeenCalledWith('org','lead')
  expect(await response.json()).toMatchObject({status:'prepared',draft:{deliveryStatus:'not_sent'}})
})
it('preserves preparation failure as non-delivery',async () => {
  mocks.requireWorker.mockResolvedValue({organizationId:'org'})
  mocks.prepareFirstReply.mockRejectedValue(new Error('provider secret'))
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(JSON.stringify(await response.json())).not.toContain('provider secret')
})
