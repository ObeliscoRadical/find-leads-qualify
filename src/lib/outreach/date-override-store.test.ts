import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({rows:[] as unknown[][],updates:vi.fn()}))
vi.mock('@/lib/env',()=>({getEnv:()=>({OPERATING_TIMEZONE:'Europe/Lisbon',OPERATING_HOURS_START:9,OPERATING_HOURS_END:20,MIN_SECONDS_BETWEEN_DMS:90})}))
vi.mock('./ai',()=>({aiProviderReady:()=>true,validateOutreachDraft:()=>{},ensureProviderAvailable:vi.fn(),classifyAndDraft:vi.fn(),ProviderUnavailableError:class extends Error{}}))
vi.mock('@/db',()=>{
 const read=()=>{if(!mock.rows.length)throw Error('Unexpected read');return mock.rows.shift()!}
 const db={execute:async()=>[],select:()=>({from:()=>({where:()=>({for:async()=>read(),orderBy:async()=>read(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(read()).then(resolve)})})}),update:()=>({set:(value:unknown)=>({where:async()=>mock.updates(value)})})}
 return {getDb:()=>({...db,transaction:async(run:(tx:unknown)=>unknown)=>run(db)})}
})
import {authorizeOutreach} from './store'
const token='00000000-0000-4000-8000-000000000000'
const config={payload:JSON.stringify({enabled:true,maxDaily:5,dateOverride:{date:'2026-10-16',maxDaily:20,minIntervalSeconds:1800}})}
const lead={id:'lead',leadStatus:'new',noContact:false,noContactReason:null,instagramUsername:'empresa',instagramProfileUrl:'https://www.instagram.com/empresa/',sourceFields:JSON.stringify({location:'Lisboa'}),instagramBio:'Empresa de manutenção. Sede em Lisboa.'}
function job(){return{id:'job',leadId:'lead',status:'running',startedAt:new Date(Date.now()-1000),payload:JSON.stringify({claimToken:token,message:'Rascunho real'})}}
function recent(count:number,ageMinutes=31){return Array.from({length:count},(_,index)=>({id:`prior${index}`,status:'completed',startedAt:new Date(Date.now()-(ageMinutes+index)*60000)}))}
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));mock.rows=[]})
afterEach(()=>vi.useRealTimers())
it('authorizes the twentieth reserved send only within the dated override and pacing',async()=>{
 const running=job();mock.rows=[[running],[config],[lead],[running,...recent(19)]]
 expect(await authorizeOutreach('org','job',token)).toBe(true)
 mock.rows=[[running],[config],[lead],[running,...recent(20)]]
 expect(await authorizeOutreach('org','job',token)).toBe(false)
 mock.rows=[[running],[config],[lead],[running,...recent(1,29)]]
 expect(await authorizeOutreach('org','job',token)).toBe(false)
})
it('rechecks expiration before Enter even if the job was reserved before20h',async()=>{
 vi.setSystemTime(new Date('2026-10-16T19:00:00Z'))
 const running={...job(),startedAt:new Date('2026-10-16T18:59:00Z')}
 mock.rows=[[running],[config],[lead]]
 expect(await authorizeOutreach('org','job',token)).toBe(false)
 expect(mock.updates).toHaveBeenCalledWith(expect.objectContaining({status:'manual_review'}))
})
it('uses permanent cap5 when no dated override exists and does not change another organization config',async()=>{
 const running=job();mock.rows=[[running],[{payload:JSON.stringify({enabled:true,maxDaily:5})}],[lead],[running,...recent(5)]]
 expect(await authorizeOutreach('other-org','job',token)).toBe(false)
 expect(mock.updates).not.toHaveBeenCalled()
})
