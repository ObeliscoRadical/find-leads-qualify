import { expect, it } from 'vitest'
import { replyEligible } from './send'
const now=Date.parse('2026-10-15T18:00:00Z')
const lead={noContact:false,leadStatus:'replied'}
const msg=(id:string,isFromLead:boolean,minutes:number,content='Bom dia')=>({id,isFromLead,createdAt:new Date(now-minutes*60000),content})
it('allows a fresh first reply after contact and ignores old inbound before outreach',()=>{
 const history=[msg('old',true,120),msg('contact',false,60),msg('incoming',true,10)]
 expect(replyEligible(lead,history,'incoming',new Date(now-600000),now)).toBe(true)
})
it('blocks optouts, wrong inbound, stale window, future anchors and an answered conversation',()=>{
 const history=[msg('contact',false,60),msg('incoming',true,10)]
 expect(replyEligible({...lead,noContact:true},history,'incoming',new Date(now-600000),now)).toBe(false)
 expect(replyEligible(lead,history,'different',new Date(now-600000),now)).toBe(false)
 expect(replyEligible(lead,history,'incoming',new Date(now-86400001),now)).toBe(false)
 expect(replyEligible(lead,history,'incoming',new Date(now+60001),now)).toBe(false)
 expect(replyEligible(lead,[...history,msg('out',false,5),msg('second',true,1)],'second',new Date(now-60000),now)).toBe(false)
 expect(replyEligible(lead,[...history,msg('out',false,5)],'incoming',new Date(now-600000),now)).toBe(false)
 expect(replyEligible(lead,[msg('contact',false,60),msg('incoming',true,10,'Não me contacte')],'incoming',new Date(now-600000),now)).toBe(false)
})
