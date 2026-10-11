import test from 'node:test'
import assert from 'node:assert/strict'
import {sendOutreach} from './outreach-worker.mjs'
const job = {instagramUsername:'lead',instagramProfileUrl:'https://www.instagram.com/lead/',content:'Olá, posso ajudar?'}
function adapter(overrides={}) {return {openConversation:async()=>({username:'lead',threadUrl:'https://www.instagram.com/direct/t/123/'}),hasExactOutgoing:async()=>false,fill:async()=>{},send:async()=>{},confirmExactOutgoing:async()=>true,...overrides}}
test('wrong recipient never receives typed text or a send',async()=>{
 let typed=0,sent=0
 const result=await sendOutreach(adapter({openConversation:async()=>({username:'other',threadUrl:'https://www.instagram.com/direct/t/123/'}),fill:async()=>typed++,send:async()=>sent++}),job,{authorize:async()=>true})
 assert.equal(result.status,'failed');assert.equal(typed,0);assert.equal(sent,0)
})
test('returns sent only after exact outgoing text confirmation',async()=>{
 let text,sent=0
 const result=await sendOutreach(adapter({fill:async value=>text=value,send:async()=>sent++,confirmExactOutgoing:async value=>value===text}),job,{authorize:async()=>true})
 assert.equal(result.status,'sent');assert.equal(result.content,job.content);assert.equal(sent,1)
})
test('ambiguous send is manual review and never retried',async()=>{
 let sent=0
 const result=await sendOutreach(adapter({send:async()=>sent++,confirmExactOutgoing:async()=>false}),job,{authorize:async()=>true})
 assert.equal(result.status,'manual_review');assert.equal(result.attemptedSend,true);assert.equal(sent,1)
})
test('identical existing outgoing text prevents duplicate send',async()=>{
 const result=await sendOutreach(adapter({hasExactOutgoing:async()=>true,send:async()=>assert.fail('duplicate send')}),job,{authorize:async()=>true})
 assert.equal(result.status,'manual_review');assert.equal(result.attemptedSend,false)
})

test('default authorization denies sending', async()=>{
 const result=await sendOutreach(adapter({fill:async()=>assert.fail('typed without authorization'),send:async()=>assert.fail('unauthorized send')}),job)
 assert.equal(result.status,'failed');assert.equal(result.attemptedSend,false)
})
test('disabled contact immediately before Enter clears composer and never sends', async()=>{
 let authorizations=0,cleared=0
 const result=await sendOutreach(adapter({clear:async()=>cleared++,send:async()=>assert.fail('contact disabled')}),job,{authorize:async()=>++authorizations===1})
 assert.equal(result.status,'failed');assert.equal(result.attemptedSend,false);assert.equal(cleared,1)
})
test('authorization network failure before Enter clears pending text',async()=>{
 let checks=0,cleared=0
 const result=await sendOutreach(adapter({clear:async()=>cleared++,send:async()=>assert.fail('authorization unavailable')}),job,{authorize:async()=>{if(++checks===2)throw new Error('network unavailable');return true}})
 assert.equal(result.status,'failed');assert.equal(result.attemptedSend,false);assert.equal(cleared,1)
})
