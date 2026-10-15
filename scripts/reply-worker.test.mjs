import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {processPreparedReply,replyConversationSignature} from './reply-worker.mjs'
import {verifiedInboundMessages,verifiedReplySequence} from './discovery-inbox.mjs'
const rows=[{author:'obeliscoradical',content:'contacto'},{author:'customer',content:'Cmg',datetime:'2026-10-15T09:00:00Z'}]
const job={id:'draft_job',claimToken:'private',profile:{username:'customer',profileUrl:'https://www.instagram.com/customer/'},content:'Obrigado! Podemos falar? https://obeliscoradical.pt',inboundContent:'Cmg',inboundExternalId:verifiedInboundMessages(rows,{username:'customer',expectedSender:'obeliscoradical',threadUrl:'https://www.instagram.com/direct/t/123/'})[0].externalId}
async function fixture(run) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reply-worker-'))
 try {await run({statePath:path.join(dir,'state.json'),evidenceDir:path.join(dir,'evidence')})} finally {await fs.rm(dir,{recursive:true,force:true})}
}
function adapter(overrides={}) {return {openConversation:async()=>({username:'customer',threadUrl:'https://www.instagram.com/direct/t/123/'}),hasExactOutgoing:async()=>false,assertConversation:async()=>{},fill:async()=>{},clear:async()=>{},send:async()=>{},confirmExactOutgoing:async()=>true,...overrides}}
test('reply sender defaults disabled and never claims',async()=>{
 assert.equal((await processPreparedReply({},'lead',{request:async()=>assert.fail('claim')})).status,'disabled')
})
test('confirmed reply persists90s cooldown across invocations and complete failure never retries',async()=>fixture(async files=>{
 let claims=0,sends=0
 const request=async(method,body)=>{if(body.action==='claim'){claims++;return {job}};if(method==='PATCH')return {authorized:true};throw Error('complete disconnected')}
 const options={...files,enabled:true,expectedSender:'obeliscoradical',request,readRows:async()=>rows,adapterFactory:()=>adapter({send:async()=>sends++}),report:()=>{},now:()=>Date.parse('2026-10-15T12:00:00Z')}
 assert.equal((await processPreparedReply({},'lead',options)).status,'registration_pending')
 assert.equal((await processPreparedReply({},'lead',options)).status,'interval_wait')
 assert.equal(claims,1);assert.equal(sends,1)
 assert.equal((await fs.stat(files.statePath)).mode & 0o777,0o600)
}))
test('new inbound during typing clears draft and blocks Enter',async()=>fixture(async files=>{
 let checks=0,sends=0,cleared=0,filled=0
 const completions=[]
 const request=async(method,body)=>{if(body.action==='claim')return {job};if(method==='PATCH')return {authorized:true};completions.push(body);return {}}
 const result=await processPreparedReply({},'lead',{...files,enabled:true,expectedSender:'obeliscoradical',request,readRows:async()=>++checks>=4?[...rows,{author:'customer',content:'Nova pergunta'}]:rows,adapterFactory:()=>adapter({fill:async()=>filled++,clear:async()=>cleared++,send:async()=>sends++}),report:()=>{}})
 assert.equal(result.status,'not_sent');assert.equal(sends,0);assert.equal(filled,1);assert.equal(cleared,1);assert.equal(completions[0].status,'not_sent')
}))
test('outbound or ambiguous latest row cannot authorize a reply',()=>{
 for(const changed of [[...rows,{author:'obeliscoradical',content:'Já respondi'}],[...rows,{author:null,content:'Cmg'}]]) assert.throws(()=>replyConversationSignature(changed,'customer','Cmg'))
})

test('new messages repeating the same last text and any observed optout reject stale draft identity',()=>{
 const proof={externalId:job.inboundExternalId,threadUrl:'https://www.instagram.com/direct/t/123/'}
 assert.doesNotThrow(()=>replyConversationSignature(rows,'customer','Cmg',proof))
 const newer=[...rows,{author:'customer',content:'Outra pergunta',datetime:'2026-10-15T09:01:00Z'},{author:'customer',content:'Cmg',datetime:'2026-10-15T09:02:00Z'}]
 assert.throws(()=>replyConversationSignature(newer,'customer','Cmg',proof),/Identidade/)
 assert.throws(()=>replyConversationSignature([rows[0],{author:'customer',content:'Não me contactem mais'},rows[1]],'customer','Cmg',proof),/não contacto/)
 const anchor={id:'anchor',content:'contacto',createdAt:'2026-10-15T08:00:00Z'},now=Date.parse('2026-10-15T10:00:00Z')
 const sequence=verifiedReplySequence(rows,rows,{username:'customer',threadUrl:proof.threadUrl,expectedSender:'obeliscoradical',anchor,now})
 assert.doesNotThrow(()=>replyConversationSignature(rows,'customer','Cmg',{externalId:sequence.messages[0].externalId,anchor,threadUrl:proof.threadUrl,now}))
 assert.throws(()=>replyConversationSignature(newer,'customer','Cmg',{externalId:sequence.messages[0].externalId,anchor,threadUrl:proof.threadUrl,now}),/Identidade/)
})

test('persisted sequence blocks editing an earlier inbound while keeping latest text and ordinal',()=>{
 const threadUrl='https://www.instagram.com/direct/t/123/'
 const anchor={id:'anchor',content:'contacto',createdAt:'2026-10-15T08:00:00Z'},now=Date.parse('2026-10-15T10:00:00Z')
 const original=[rows[0],{author:'customer',content:'Primeira parte'},rows[1]]
 const observed=verifiedReplySequence(original,original,{username:'customer',threadUrl,expectedSender:'obeliscoradical',anchor,now})
 const proof={externalId:observed.messages.at(-1).externalId,anchor,threadUrl,previous:observed.state,now}
 assert.doesNotThrow(()=>replyConversationSignature(original,'customer','Cmg',proof))
 const changed=[original[0],{author:'customer',content:'Primeira parte editada'},original[2]]
 assert.throws(()=>replyConversationSignature(changed,'customer','Cmg',proof),/Identidade/)
 const noTimestampDuplicate=[...rows,{author:'customer',content:'Cmg'}]
 assert.throws(()=>replyConversationSignature(noTimestampDuplicate,'customer','Cmg',{externalId:job.inboundExternalId,threadUrl}),/Identidade/)
})
