import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({rows:[] as unknown[][], updates:vi.fn(),inserts:vi.fn()}))
vi.mock('@/db',()=>({getDb:()=>({transaction:async(run:(tx:unknown)=>Promise<unknown>)=>run({
  select:()=>({from:()=>({where:()=>({for:async()=>mock.rows.shift()||[]})})}),
  update:()=>({set:(value:unknown)=>{mock.updates(value);return{where:async()=>[]}}}),
  insert:()=>({values:(value:unknown)=>{mock.inserts(value);return{onConflictDoNothing:async()=>[]}}}),
})})}))
import {completeOutreach} from './store'
const token='1d8079db-cb46-43a3-a2ee-0094e322f983'
const job={id:'job',leadId:'lead',status:'running',payload:JSON.stringify({claimToken:token,message:'Real personalized message'})}
const lead={id:'lead',leadStatus:'new',noContact:false}
const input={jobId:'job',claimToken:token,outcome:'sent' as const,threadUrl:'https://www.instagram.com/direct/t/123/'}
beforeEach(()=>{vi.clearAllMocks();mock.rows=[]})
it('records history and contacted only after a confirmed sent outcome',async()=>{
 mock.rows=[[job],[lead]]
 expect(await completeOutreach('org',input)).toEqual({recorded:true,duplicate:false})
 expect(mock.inserts).toHaveBeenCalledWith(expect.objectContaining({content:'Real personalized message',isFromLead:false}))
 expect(mock.updates).toHaveBeenCalledWith(expect.objectContaining({leadStatus:'contacted'}))
 expect(mock.updates).toHaveBeenCalledWith(expect.objectContaining({status:'completed'}))
})
it('never retries uncertain/failed sending and never marks them contacted',async()=>{
 for(const outcome of ['uncertain','failed'] as const){mock.rows=[[job],[lead]];expect(await completeOutreach('org',{...input,outcome})).toEqual({recorded:false,manualReview:true})}
 expect(mock.inserts).not.toHaveBeenCalled()
 expect(mock.updates).toHaveBeenCalledWith(expect.objectContaining({status:'manual_review'}))
 expect(mock.updates).not.toHaveBeenCalledWith(expect.objectContaining({leadStatus:'contacted'}))
})
it('blocks stale tokens, expired/manual-review jobs and opted-out records',async()=>{
 mock.rows=[[job]];expect(await completeOutreach('org',{...input,claimToken:'wrong'})).toBeNull()
 mock.rows=[[{...job,status:'manual_review'}]];expect(await completeOutreach('org',input)).toBeNull()
 mock.rows=[[job],[{...lead,leadStatus:'opted_out'}]];expect(await completeOutreach('org',input)).toEqual({recorded:false,manualReview:true})
 expect(mock.inserts).not.toHaveBeenCalled()
})
it('repeated acknowledgement is idempotent and inserts no duplicate outbound message',async()=>{
 mock.rows=[[{...job,status:'completed'}]]
 expect(await completeOutreach('org',input)).toEqual({recorded:true,duplicate:true})
 expect(mock.inserts).not.toHaveBeenCalled();expect(mock.updates).not.toHaveBeenCalled()
})
