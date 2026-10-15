import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({getDb:vi.fn()}))
vi.mock('@/db',() => mock)
vi.mock('@/lib/outreach/ai',() => ({providerConfig:() => ({url:'https://ai.test',key:'test',model:'model',provider:'litellm'}),ProviderUnavailableError:Error}))
import {prepareFirstReply} from './draft'
const now = Date.now()
const outgoing = {id:'msg_outreach_one',isFromLead:false,sentVia:'instagram_browser_ai',content:'Primeiro contacto',createdAt:new Date(now-60000)}
const incoming = {id:'reply_one',isFromLead:true,sentVia:'instagram_browser',content:'Pode explicar como funciona?',createdAt:new Date(now-1000)}
function setup(history:object[],existing?:object) {
  const insert = vi.fn(); const update = vi.fn(); let reads=0
  const results = [[{id:'lead',leadStatus:'replied',noContact:false}],history,existing ? [existing] : []]
  const result = () => results[reads++]
  const tx = {
    select:() => ({from:() => ({where:() => ({for:async () => result(),orderBy:async () => result(),then:(resolve:(v:unknown)=>unknown) => Promise.resolve(result()).then(resolve)})})}),
    insert:() => ({values:async (value:unknown) => insert(value)}),
    update:() => ({set:(value:unknown) => ({where:async () => update(value)})}),
  }
  mock.getDb.mockReturnValue({transaction:async (run:(tx:unknown)=>unknown) => run(tx)})
  return {insert,update}
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async () => ({choices:[{finish_reason:'stop',message:{content:JSON.stringify({shouldReply:true,message:'Obrigado! Podemos falar sobre apoio elétrico aos imóveis? Conheça https://obeliscoradical.pt.'})}}]})}))
})
it('ignores old incoming history before prospecting when selecting first response',async () => {
  const state=setup([{...incoming,id:'older',createdAt:new Date(now-120000)},outgoing,incoming])
  expect(await prepareFirstReply('org','lead')).toMatchObject({status:'prepared',draft:{inboundMessageId:'reply_one',deliveryStatus:'not_sent'}})
  expect(state.insert).toHaveBeenCalledOnce()
})
it('does not generate after a human already answered or outside 24h',async () => {
  setup([outgoing,incoming,{...outgoing,id:'manual',sentVia:'manual',createdAt:new Date(now)}])
  expect(await prepareFirstReply('org','lead')).toMatchObject({status:'blocked'})
  setup([{...outgoing,createdAt:new Date(now-172800000)},{...incoming,createdAt:new Date(now-90000000)}])
  expect(await prepareFirstReply('org','lead')).toMatchObject({status:'expired'})
  expect(fetch).not.toHaveBeenCalled()
})
it('reuses same draft without AI and refreshes only an unsent stale draft',async () => {
  const payload={inboundMessageId:'reply_one',deliveryStatus:'not_sent',content:'Existing'}
  setup([outgoing,incoming],{status:'completed',payload:JSON.stringify(payload)})
  expect(await prepareFirstReply('org','lead')).toMatchObject({status:'prepared',draft:payload})
  expect(fetch).not.toHaveBeenCalled()
  const state=setup([outgoing,incoming],{status:'completed',payload:JSON.stringify({...payload,inboundMessageId:'old'})})
  expect(await prepareFirstReply('org','lead')).toMatchObject({status:'prepared'})
  expect(state.update).toHaveBeenCalledOnce();expect(state.insert).not.toHaveBeenCalled()
})
