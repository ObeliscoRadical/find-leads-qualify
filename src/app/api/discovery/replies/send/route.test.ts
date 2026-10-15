import { beforeEach,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({worker:vi.fn(),claim:vi.fn(),authorize:vi.fn(),complete:vi.fn()}))
vi.mock('@/lib/discovery/auth',()=>({requireWorker:mocks.worker}))
vi.mock('@/lib/replies/send',()=>({claimReply:mocks.claim,authorizeReply:mocks.authorize,completeReply:mocks.complete}))
import { POST,PATCH } from './route'
const token='00000000-0000-4000-8000-000000000000'
const req=(method:string,body:unknown)=>new Request('http://localhost/api/discovery/replies/send',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{vi.resetAllMocks();mocks.worker.mockResolvedValue({organizationId:'org'})})
it('rejects unauthenticated claim and authorization',async()=>{
 mocks.worker.mockResolvedValue(null)
 expect((await POST(req('POST',{action:'claim',leadId:'lead'}))).status).toBe(401)
 expect((await PATCH(req('PATCH',{jobId:'job',claimToken:token}))).status).toBe(401)
 expect(mocks.claim).not.toHaveBeenCalled();expect(mocks.authorize).not.toHaveBeenCalled()
})
it('scopes claim to authenticated organization and does not reuse first contact routes',async()=>{
 mocks.claim.mockResolvedValue(null)
 const response=await POST(req('POST',{action:'claim',leadId:'lead'}))
 expect(await response.json()).toEqual({job:null})
 expect(mocks.claim).toHaveBeenCalledWith('org','lead')
})
it('rejects confirmation without valid thread proof and accepts optional native id',async()=>{
 for(const threadUrl of [undefined,'https://evil.example/direct/t/1/','https://www.instagram.com/direct/t/1/?x=1']) {
  expect((await POST(req('POST',{action:'complete',jobId:'job',claimToken:token,status:'confirmed',threadUrl}))).status).toBe(422)
 }
 expect(mocks.complete).not.toHaveBeenCalled()
 mocks.complete.mockResolvedValue({status:'completed'})
 expect((await POST(req('POST',{action:'complete',jobId:'job',claimToken:token,status:'confirmed',threadUrl:'https://www.instagram.com/direct/t/1/'}))).status).toBe(200)
})
it('returns conflict when latest message/optout/expiry invalidates authorization',async()=>{
 mocks.authorize.mockResolvedValue(false)
 expect((await PATCH(req('PATCH',{jobId:'job',claimToken:token}))).status).toBe(409)
 expect(mocks.authorize).toHaveBeenCalledWith('org','job',token)
})
