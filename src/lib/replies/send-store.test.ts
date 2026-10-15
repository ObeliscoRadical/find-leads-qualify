import { beforeEach,expect,it,vi } from 'vitest'
const mock=vi.hoisted(()=>({getDb:vi.fn()}))
vi.mock('@/db',()=>mock)
import {claimReply,authorizeReply,completeReply} from './send'
const token='00000000-0000-4000-8000-000000000000'
const now=Date.now()
const lead={id:'lead',leadStatus:'replied',noContact:false,instagramUsername:'company',instagramProfileUrl:'https://www.instagram.com/company/'}
const history=[{id:'msg_outreach_1',isFromLead:false,sentVia:'instagram_browser_ai',content:'Olá',createdAt:new Date(now-60000)},{id:'in',instagramMessageId:'ig-dom-v1:'+'a'.repeat(64),leadId:'lead',isFromLead:true,sentVia:'instagram_browser',content:'Pode explicar?',createdAt:new Date(now-1000)}]
const content='Obrigado! Podemos ajudar com apoio elétrico? Conheça https://obeliscoradical.pt.'
const draft={id:'draft',status:'completed',payload:JSON.stringify({deliveryStatus:'not_sent',content,inboundMessageId:'in'})}
const payload={claimToken:token,content,inboundMessageId:'in',draftId:'draft',claimedAt:new Date(now).toISOString(),authorizedAt:new Date(now).toISOString()}
const send={id:'reply_send_draft',leadId:'lead',status:'running',payload:JSON.stringify(payload)}
function setup(results:unknown[][]){
 const inserted:unknown[]=[];const updated:unknown[]=[]
 const read=()=>{if(!results.length)throw new Error('Unexpected database read');return results.shift()}
 const tx={
  select:()=>({from:()=>({where:()=>({for:async()=>read(),orderBy:async()=>read(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(read()).then(resolve)})})}),
  insert:()=>({values:(value:unknown)=>{inserted.push(value);return {then:(resolve:(v:unknown)=>unknown)=>Promise.resolve().then(resolve),onConflictDoNothing:async()=>{}}}}),
  update:()=>({set:(value:unknown)=>({where:async()=>{updated.push(value)}})}),
 }
 mock.getDb.mockReturnValue({transaction:async(run:(tx:unknown)=>unknown)=>run(tx)})
 return {inserted,updated}
}
beforeEach(()=>vi.clearAllMocks())
it('reserves exactly once and refuses any existing interrupted send without reclaim',async()=>{
 let state=setup([[lead],[draft],[],[lead],history])
 expect(await claimReply('org','lead')).toMatchObject({id:'reply_send_draft',content,inboundContent:'Pode explicar?'})
 expect(state.inserted).toHaveLength(1)
 expect(state.updated[0]).toMatchObject({payload:expect.stringContaining('sending')})
 state=setup([[lead],[draft],[{...send,status:'running'}]])
 expect(await claimReply('org','lead')).toBeNull();expect(state.inserted).toHaveLength(0)
})
it('rejects wrong token and rechecks optout plus expiry before Enter',async()=>{
 let state=setup([[send],[lead],[send]])
 expect(await authorizeReply('org',send.id,'wrong')).toBe(false);expect(state.updated).toHaveLength(0)
 state=setup([[send],[lead],[send],[{...lead,noContact:true}],history])
 expect(await authorizeReply('org',send.id,token)).toBe(false);expect(state.updated).toHaveLength(0)
 const expired={...send,payload:JSON.stringify({...payload,claimedAt:new Date(now-180001).toISOString()})}
 state=setup([[expired],[lead],[expired]])
 expect(await authorizeReply('org',send.id,token)).toBe(false);expect(state.updated).toHaveLength(0)
})
it('records confirmed delivery once and completion replay never inserts again',async()=>{
 let state=setup([[send],[lead],[send],[draft]])
 expect(await completeReply('org',{jobId:send.id,claimToken:token,status:'confirmed',threadUrl:'https://www.instagram.com/direct/t/1/'})).toEqual({status:'completed'})
 expect(state.inserted).toHaveLength(1)
 expect(state.inserted[0]).toMatchObject({id:'msg_reply_send_draft',sentVia:'instagram_browser_reply_ai',content})
 const completed={...send,status:'completed'}
 state=setup([[completed],[lead],[completed]])
 expect(await completeReply('org',{jobId:send.id,claimToken:token,status:'confirmed',threadUrl:'https://www.instagram.com/direct/t/1/'})).toEqual({status:'completed'})
 expect(state.inserted).toHaveLength(0)
})
it('marks uncertain send for review without inserting history and prevents another claim',async()=>{
 let state=setup([[send],[lead],[send],[draft]])
 expect(await completeReply('org',{jobId:send.id,claimToken:token,status:'unknown'})).toEqual({status:'manual_review'})
 expect(state.inserted).toHaveLength(0)
 expect(state.updated).toContainEqual(expect.objectContaining({status:'manual_review'}))
 state=setup([[lead],[draft],[{...send,status:'manual_review'}]])
 expect(await claimReply('org','lead')).toBeNull();expect(state.inserted).toHaveLength(0)
})

it('returns the scoped observed contact anchor and sequence ordinal, blocks unmappable Meta IDs',async()=>{
 const anchor={...history[0],leadId:'lead'}
 const observed={...history[1],sentVia:'instagram_browser_observed',instagramMessageId:'ig-sequence-v1:'+'b'.repeat(64)}
 const proof={anchorMessageId:anchor.id,receivedAfter:anchor.createdAt.toISOString(),observedAt:observed.createdAt.toISOString(),timestampEstimated:true,sequenceOrdinal:1}
 const evidence={payload:JSON.stringify(proof)}
 let state=setup([[lead],[draft],[],[lead],[anchor,observed],[evidence],[anchor],[evidence]])
 expect(await claimReply('org','lead')).toMatchObject({contactAnchor:{id:anchor.id,content:anchor.content,createdAt:anchor.createdAt.toISOString()},sequenceOrdinal:1,inboundExternalId:observed.instagramMessageId})
 expect(state.inserted).toHaveLength(1)
 state=setup([[lead],[draft],[],[lead],[history[0],{...history[1],instagramMessageId:'meta-opaque'}]])
 expect(await claimReply('org','lead')).toBeNull();expect(state.inserted).toHaveLength(0)
})
