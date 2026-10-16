import { describe, expect, it } from 'vitest'
import { requestsOptOut, validateReplyDraft, replyWindowStart } from './draft'
describe('first customer reply safeguards', () => {
  it('recognises refusals without mistaking a request for more information', () => {
    for (const text of ['Não me contactem mais','Remova o meu contacto','Sem interesse','Não estamos interessados','STOP']) expect(requestsOptOut(text)).toBe(true)
    expect(requestsOptOut('Pode enviar mais informação sobre os serviços?')).toBe(false)
  })
  it('requires the authorised website and a question without invented promises', () => {
    expect(validateReplyDraft('Obrigado! Podemos conversar sobre apoio elétrico aos imóveis? Conheça https://obeliscoradical.pt.')).toContain('obeliscoradical.pt')
    for (const text of ['Conheça o nosso trabalho, podemos conversar?', 'Visite https://evil.pt e https://obeliscoradical.pt, sim?', 'Garantimos resultados. Conheça https://obeliscoradical.pt, sim?']) expect(() => validateReplyDraft(text)).toThrow()
  })
})

it('uses confirmed contact time as conservative bound for an observed reply',async () => {
  const anchor={id:'msg_outreach_anchor',sentVia:'instagram_browser_ai',createdAt:new Date('2026-10-15T08:00:00Z')}
  const message={id:'observed',leadId:'lead',sentVia:'instagram_browser_observed',createdAt:new Date('2026-10-15T20:00:00Z')}
  const proof={anchorMessageId:anchor.id,receivedAfter:anchor.createdAt.toISOString(),observedAt:message.createdAt.toISOString(),timestampEstimated:true}
  let reads=0
  const db={select:() => ({from:() => ({where:async () => ++reads === 1 ? [{payload:JSON.stringify(proof)}] : [anchor]})})} as unknown as Parameters<typeof replyWindowStart>[0]
  expect(await replyWindowStart(db,'org',message)).toEqual(anchor.createdAt)
})
it('fails closed if observation proof has no matching owned contact anchor',async () => {
  const message={id:'observed',leadId:'lead',sentVia:'instagram_browser_observed',createdAt:new Date()}
  const db={select:() => ({from:() => ({where:async () => []})})} as unknown as Parameters<typeof replyWindowStart>[0]
  expect(await replyWindowStart(db,'org',message)).toBeNull()
})

it('rejects proof requiring human review even if observed recently',async()=>{
 const message={id:'observed',leadId:'lead',sentVia:'instagram_browser_observed',createdAt:new Date()}
 const proof={anchorMessageId:'anchor',receivedAfter:new Date().toISOString(),observedAt:message.createdAt.toISOString(),timestampEstimated:true,requiresHumanReview:true}
 let reads=0
 const db={select:()=>({from:()=>({where:async()=>{reads++;return [{payload:JSON.stringify(proof)}]}})})} as unknown as Parameters<typeof replyWindowStart>[0]
 expect(await replyWindowStart(db,'org',message)).toBeNull()
 expect(reads).toBe(1)
})
