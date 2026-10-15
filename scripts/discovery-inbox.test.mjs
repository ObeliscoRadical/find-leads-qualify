import test from 'node:test'
import assert from 'node:assert/strict'
import {verifiedInboundMessages, inspectInbox, importReplyBatch, stopInboxInspection} from './discovery-inbox.mjs'
const options={username:'customer',expectedSender:'obeliscoradical',threadUrl:'https://www.instagram.com/direct/t/123/'}
const inbound={author:'customer',content:'Obrigado, qual o preço?',datetime:'2026-10-15T20:12:03Z'}
test('inbound signature survives list reordering and excludes our outgoing echoes',()=>{
 const first=verifiedInboundMessages([inbound,{...inbound,author:'obeliscoradical'}],options)
 const replay=verifiedInboundMessages([{author:'other'},inbound],options)
 assert.equal(first.length,1)
 assert.equal(first[0].externalId,replay[0].externalId)
 assert.equal(first[0].content,inbound.content)
})
test('repeated text at different observed times remains different messages',()=>{
 const result=verifiedInboundMessages([inbound,{...inbound,datetime:'2026-10-15T20:13:03Z'}],options)
 assert.equal(result.length,2)
 assert.notEqual(result[0].externalId,result[1].externalId)
})
test('ambiguous duplicate signatures and missing or relative times require manual review',()=>{
 assert.deepEqual(verifiedInboundMessages([inbound,inbound],options),[])
 for(const datetime of [undefined,'Today 09:00','2026-10-15T09:00:00','invalid']) assert.deepEqual(verifiedInboundMessages([{...inbound,datetime}],options),[])
 assert.deepEqual(verifiedInboundMessages([inbound],{...options,expectedSender:undefined}),[])
 assert.deepEqual(verifiedInboundMessages([inbound],{...options,threadUrl:'https://evil.test/direct/t/123/'}),[])
})
test('same text in other threads has different replay identity',()=>{
 const a=verifiedInboundMessages([inbound],options)[0]
 const b=verifiedInboundMessages([inbound],{...options,threadUrl:'https://www.instagram.com/direct/t/456/'})[0]
 assert.notEqual(a.externalId,b.externalId)
})
test('invalid profiles never navigate or import',async()=>{
 let calls=0
 const result=await inspectInbox({goto:async()=>assert.fail('navigation')},[{instagramUsername:'customer',instagramProfileUrl:'https://www.instagram.com/wrong/'}],{expectedSender:'obeliscoradical',ingest:async()=>calls++,report:()=>{}})
 assert.equal(result[0].status,'invalid_profile')
 assert.equal(calls,0)
})

test('imports every split reply before preparing one draft, including on replay',async()=>{
 const events=[]
 await importReplyBatch([{content:'first'},{content:'second'}],{ingest:async message=>{events.push(message.content);return {leadId:'lead',imported:false}},prepareDraft:async id=>events.push(`draft:${id}`)})
 assert.deepEqual(events,['first','second','draft:lead'])
})
test('failed batch never drafts from partially imported conversation',async()=>{
 let drafted=false
 await assert.rejects(importReplyBatch([{content:'first'},{content:'second'}],{ingest:async message=>{if(message.content==='second')throw Error('unavailable');return {leadId:'lead'}},prepareDraft:async()=>drafted=true}),/unavailable/)
 assert.equal(drafted,false)
})

const monitored=[{instagramUsername:'first',instagramProfileUrl:'https://www.instagram.com/first/'},{instagramUsername:'second',instagramProfileUrl:'https://www.instagram.com/second/'}]
test('an unavailable individual profile does not starve the next lead',async()=>{
 const visited=[]
 const result=await inspectInbox({goto:async url=>{visited.push(url);throw Error('Botão de mensagem indisponível ou ambíguo.')}},monitored,{expectedSender:'obeliscoradical',report:()=>{}})
 assert.equal(visited.length,2)
 assert.equal(result.length,2)
 assert.equal(result[0].status,'manual_review_required')
})
test('account, login, challenge and authorization failures stop the inbox batch',async()=>{
 for(const error of [Error('Conta remetente do Chrome mudou.'),Error('Instagram exige confirmação humana.'),Error('Faça login no Instagram.'),Object.assign(Error('API respondeu 401'),{status:401}),Object.assign(Error('API respondeu 403'),{status:403})]) {
  assert.equal(stopInboxInspection(error),true)
  let visited=0
  await inspectInbox({goto:async()=>{visited++;throw error}},monitored,{expectedSender:'obeliscoradical',report:()=>{}})
  assert.equal(visited,1)
 }
 assert.equal(stopInboxInspection(Error('Timeout 20000ms exceeded')),false)
})

test('webhook reply prepares from server history even without an importable DOM message',async()=>{
 const prepared=[]
 const recipient={filter(){return this},first(){return this},waitFor:async()=>{},all:async()=>[{getAttribute:async()=>'/customer/'}]}
 const sender={first(){return this},waitFor:async()=>{},getAttribute:async()=>'/obeliscoradical/'}
 const page={goto:async()=>{},url:()=> 'https://www.instagram.com/customer/',getByRole:(role,{name}={})=>role==='button'?{first(){return this},waitFor:async()=>{},count:async()=>1,click:async()=>{}}:name?.source?.startsWith('^Foto')?sender:recipient,locator:selector=>selector.includes('contenteditable')?{waitFor:async()=>{},count:async()=>1}: {evaluateAll:async()=>selector.includes('article')?[]:['/direct/t/123/']}}
 const result=await inspectInbox(page,[{id:'webhook-lead',leadStatus:'replied',instagramUsername:'customer',instagramProfileUrl:'https://www.instagram.com/customer/'}],{expectedSender:'obeliscoradical',ingest:async()=>assert.fail('No DOM message to ingest'),prepareDraft:async id=>prepared.push(id),report:()=>{}})
 assert.equal(result[0].status,'no_verified_reply')
 assert.deepEqual(result[0].messages,[])
 assert.deepEqual(prepared,['webhook-lead'])
 await inspectInbox({},[{id:'untouched-lead',leadStatus:'contacted',instagramUsername:'customer',instagramProfileUrl:'https://www.instagram.com/wrong/'}],{expectedSender:'obeliscoradical',prepareDraft:async id=>prepared.push(id),report:()=>{}})
 assert.deepEqual(prepared,['webhook-lead'])
})
