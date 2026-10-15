import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({rows:[] as unknown[][],provider:null as {payload:string}|null,insert:vi.fn(),health:vi.fn(),chain:Promise.resolve() as Promise<unknown>}))
vi.mock('@/lib/env',()=>({getEnv:()=>({OPERATING_TIMEZONE:'Europe/Lisbon',OPERATING_HOURS_START:0,OPERATING_HOURS_END:24})}))
vi.mock('./ai',()=>({aiProviderReady:()=>true,ensureProviderAvailable:mock.health,classifyAndDraft:vi.fn(),validateOutreachDraft:vi.fn(),ProviderUnavailableError:class extends Error{}}))
vi.mock('@/db',()=>{
 const db={
  execute:async()=>[],
  select:()=>({from:()=>({where:async()=>mock.rows.length ? mock.rows.shift()! : mock.provider ? [mock.provider] : []})}),
  insert:()=>({values:(row:{kind:string;payload:string})=>{mock.insert(row);if(row.kind==='outreach_provider')mock.provider={payload:row.payload};return{onConflictDoUpdate:async()=>[]}}}),
 }
 return{getDb:()=>({...db,transaction:(run:(tx:typeof db)=>Promise<unknown>)=>{const p=mock.chain.then(()=>run(db));mock.chain=p.catch(()=>{});return p}})}
})
import {claimOutreach,acquireProviderProbe,finishProviderProbe} from './store'
import {ProviderUnavailableError} from './ai'
const config={payload:JSON.stringify({enabled:true,maxDaily:5})}
beforeEach(()=>{vi.clearAllMocks();mock.rows=[];mock.provider=null;mock.chain=Promise.resolve()})
it('never reserves a lead or daily classification slot while the gateway starts',async()=>{
 mock.rows=[[config]]
 mock.health.mockRejectedValue(new ProviderUnavailableError('Gateway a iniciar'))
 const result=await claimOutreach('org')
 expect(result.job).toBeNull()
 expect(result.providerState?.paused).toBe(true)
 expect(mock.insert).toHaveBeenCalledTimes(2)
 for(const [row] of mock.insert.mock.calls) expect(row.kind).toBe('outreach_provider')
})
it('respects persisted cooldown before any provider call or lead reservation',async()=>{
 mock.rows=[[config]];mock.provider={payload:JSON.stringify({failures:2,retryAt:new Date(Date.now()+120000).toISOString(),message:'HTTP502'})}
 const result=await claimOutreach('org')
 expect(result.providerState?.paused).toBe(true)
 expect(mock.health).not.toHaveBeenCalled()
 expect(mock.insert).not.toHaveBeenCalled()
})
it('admits only one concurrent provider probe and cannot clear a newer pause with a stale token',async()=>{
 const results=await Promise.all([acquireProviderProbe('org'),acquireProviderProbe('org')])
 expect(results.filter(x=>x.admitted)).toHaveLength(1)
 const first=results.find(x=>x.admitted)!
 if(!first.admitted)throw Error('no probe')
 await finishProviderProbe('org',first.token,'HTTP502')
 const saved=mock.provider?.payload
 await finishProviderProbe('org','stale-success')
 expect(mock.provider?.payload).toBe(saved)
 expect((await acquireProviderProbe('org')).admitted).toBe(false)
})
