import { expect,it } from 'vitest'
import {completionSchema,eligibleLead,operatingHours,outreachConfigSchema,verifiedServiceRegion,canClassifyDaily,canRetryClassification} from './state'
const lead = {leadStatus:'new',noContact:false,noContactReason:null,sourceFields:null,instagramUsername:'empresa',instagramProfileUrl:'https://www.instagram.com/empresa/'}
it('permits cleaning provider block reversal only for the precise system-owned assessment',()=>{
  expect(eligibleLead(lead)).toBe(true)
  expect(eligibleLead({...lead,noContact:true,noContactReason:'User opted out'})).toBe(false)
  expect(eligibleLead({...lead,leadStatus:'opted_out'})).toBe(false)
  expect(eligibleLead({...lead,noContact:true,noContactReason:'Rever qualificação da busca: A biografia anuncia serviços de limpeza; confirmar se é um comprador do serviço procurado.',sourceFields:JSON.stringify({assessment:{buyerFit:'service_provider'}})})).toBe(true)
  expect(eligibleLead({...lead,noContact:true,noContactReason:'Fora do segmento da busca: Limpeza',sourceFields:JSON.stringify({assessment:{buyerFit:'service_provider'}})})).toBe(false)
})
it('requires actual thread evidence for sent and caps daily first contact at five',()=>{
  const input = {jobId:'job',claimToken:'1d8079db-cb46-43a3-a2ee-0094e322f983',outcome:'sent'}
  expect(completionSchema.safeParse(input).success).toBe(false)
  expect(completionSchema.safeParse({...input,threadUrl:'https://www.instagram.com/direct/t/123/'}).success).toBe(true)
  expect(completionSchema.safeParse({...input,threadUrl:'https://evil.example/direct/t/123/'}).success).toBe(false)
  expect(outreachConfigSchema.safeParse({enabled:true,maxDaily:6}).success).toBe(false)
  expect(outreachConfigSchema.parse({}).enabled).toBe(false)
})
it('uses Lisbon operating hours with daylight saving time',()=>{
  expect(operatingHours(new Date('2026-10-11T08:00:00Z'),'Europe/Lisbon',9,20)).toBe(true)
  expect(operatingHours(new Date('2026-10-11T19:00:00Z'),'Europe/Lisbon',9,20)).toBe(false)
})

it('requires explicit bio region evidence in the actual service area, never surname Lisboa',()=>{
 const fields=JSON.stringify({location:'Lisboa',assessment:{locationEvidence:'confirmed'}})
 expect(verifiedServiceRegion({sourceFields:fields,instagramBio:'Maria Lisboa. Empresa de limpeza profissional.'})).toBe(false)
 expect(verifiedServiceRegion({sourceFields:fields,instagramBio:'Empresa de limpeza profissional. Sede em Lisboa.'})).toBe(true)
 expect(verifiedServiceRegion({sourceFields:JSON.stringify({location:'Porto'}),instagramBio:'Empresa de limpeza. Sede em Porto.'})).toBe(false)
 expect(verifiedServiceRegion({sourceFields:null,instagramBio:'Sede em Lisboa.'})).toBe(false)
})

it('uses a bounded classification budget separate from sent-message daily limit',()=>{
 expect(outreachConfigSchema.parse({enabled:true,maxDaily:1}).maxDaily).toBe(1)
 expect(canClassifyDaily(1)).toBe(true)
 expect(canClassifyDaily(19)).toBe(true)
 expect(canClassifyDaily(20)).toBe(false)
})

it('retries failed AI classification on a later Lisbon day with no browser send attempt, at most three times',()=>{
 const now=new Date('2026-10-12T10:00:00Z')
 const failed={status:'failed',attempts:0,payload:JSON.stringify({classificationAttempts:1,lastClassificationAt:'2026-10-11T10:00:00Z'}),createdAt:new Date('2026-10-11T10:00:00Z'),startedAt:null}
 expect(canRetryClassification(failed,now,'Europe/Lisbon')).toBe(true)
 expect(canRetryClassification(failed,new Date('2026-10-11T15:00:00Z'),'Europe/Lisbon')).toBe(false)
 for(const status of ['manual_review','completed','running','rejected'])expect(canRetryClassification({...failed,status},now,'Europe/Lisbon')).toBe(false)
 expect(canRetryClassification({...failed,attempts:1},now,'Europe/Lisbon')).toBe(false)
 expect(canRetryClassification({...failed,payload:JSON.stringify({classificationAttempts:3})},now,'Europe/Lisbon')).toBe(false)
 expect(canRetryClassification({...failed,payload:JSON.stringify({outcome:'uncertain'})},now,'Europe/Lisbon')).toBe(false)
})
