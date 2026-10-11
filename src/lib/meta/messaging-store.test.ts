import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('@/db',()=>({getDb:vi.fn()}));
import {getDb} from '@/db';
import {jobs,messages,leads} from '@/db/schema';
import {ingestInstagramEvent} from './messaging';
const event={sender:{id:'12'},recipient:{id:'34'},timestamp:1720000000000,message:{mid:'real_mid',text:'Resposta real'}};
describe('durable Meta incoming storage',()=>{
    beforeEach(()=>vi.clearAllMocks());
    function setup(hasLead=true) {
        const saved=new Map<string,{status:string}>();
        const inserted:Record<string,unknown>[]=[];
        const updates:Record<string,unknown>[]=[];
        let currentId='';
        const db={
            select:()=>({from:()=>({where:async()=>[{organizationId:'org_owner',igUserId:'34',scopes:'[]',pageTokenEncrypted:null}]})}),
            insert:()=>({values:(value:{id:string})=>{currentId=value.id;return {onConflictDoNothing:async()=>{if(!saved.has(value.id))saved.set(value.id,{status:'pending'});}}}}),
            transaction:async(run:(tx:unknown)=>unknown)=>{
                let selects=0;
                const tx={
                    select:()=>({from:()=>({where:()=>({for:async()=>++selects===1 ? [saved.get(currentId)] : hasLead ? [{id:'lead_owner',leadStatus:'contacted',noContact:true,instagramId:'12'}] : []})})}),
                    insert:(table:unknown)=>({values:(value:Record<string,unknown>)=>({onConflictDoNothing:()=>({returning:async()=>{if(table===messages)inserted.push(value);return [{id:'msg_one'}];}})})}),
                    update:(table:unknown)=>({set:(value:Record<string,unknown>)=>({where:async()=>{if(table===jobs)saved.set(currentId,{status:'completed'});if(table===leads)updates.push(value);}})}),
                };
                return run(tx);
            },
        };
        vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
        return {saved,inserted,updates};
    }
    it('deduplicates the same mid and does not change contact restrictions',async()=>{
        const state=setup();
        await ingestInstagramEvent('34',event);await ingestInstagramEvent('34',event);
        expect(state.saved.size).toBe(1);expect(state.inserted).toHaveLength(1);
        expect(state.inserted[0]).toMatchObject({organizationId:'org_owner',content:'Resposta real',instagramMessageId:'real_mid',sentVia:'api',isFromLead:true});
        expect(state.updates[0]).toMatchObject({leadStatus:'replied'});
        expect(state.updates[0]).not.toHaveProperty('noContact');expect(state.updates[0]).not.toHaveProperty('noContactReason');
    });
    it('preserves unmatched real events pending without inventing a lead or response',async()=>{
        const state=setup(false);await ingestInstagramEvent('34',event);
        expect([...state.saved.values()][0].status).toBe('pending');expect(state.inserted).toHaveLength(0);expect(state.updates).toHaveLength(0);
    });
});
