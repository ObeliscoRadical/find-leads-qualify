import { beforeEach,expect,it,vi } from 'vitest'
const mock = vi.hoisted(()=>({requireWorker:vi.fn(),claimOutreach:vi.fn(),completeOutreach:vi.fn()}))
vi.mock('@/lib/discovery/auth',()=>mock)
vi.mock('@/lib/outreach/store',()=>mock)
import {GET,POST} from './route'
const url='https://app.test/api/outreach/worker'
beforeEach(()=>{vi.clearAllMocks();mock.requireWorker.mockResolvedValue({organizationId:'org'});mock.claimOutreach.mockResolvedValue({job:null,config:{enabled:false,maxDaily:5},providerReady:false});mock.completeOutreach.mockResolvedValue({recorded:true})})
it('requires paired worker for claiming and confirming sends',async()=>{mock.requireWorker.mockResolvedValue(null);expect((await GET(new Request(url))).status).toBe(401);expect((await POST(new Request(url,{method:'POST',body:'{}'}))).status).toBe(401);expect(mock.claimOutreach).not.toHaveBeenCalled()})
it('claims only within worker organization and preserves disabled state',async()=>{expect(await(await GET(new Request(url))).json()).toEqual({job:null,config:{enabled:false,maxDaily:5},providerReady:false});expect(mock.claimOutreach).toHaveBeenCalledWith('org')})
it('rejects send claims without a real conversation and stale claim tokens',async()=>{
 const body={jobId:'job',claimToken:'1d8079db-cb46-43a3-a2ee-0094e322f983',outcome:'sent'}
 expect((await POST(new Request(url,{method:'POST',body:JSON.stringify(body)}))).status).toBe(422)
 expect(mock.completeOutreach).not.toHaveBeenCalled()
 mock.completeOutreach.mockResolvedValue(null)
 expect((await POST(new Request(url,{method:'POST',body:JSON.stringify({...body,threadUrl:'https://www.instagram.com/direct/t/123/'})}))).status).toBe(409)
})
