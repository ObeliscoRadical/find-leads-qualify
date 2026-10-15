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

test('recipient changed after typing blocks Enter and clears text',async()=>{
 let cleared=0, checks=0
 const result=await sendOutreach(adapter({assertConversation:async()=>{if(++checks===2)throw Error('changed')},clear:async()=>cleared++,send:async()=>assert.fail('wrong recipient')}),job,{authorize:async()=>true})
 assert.equal(result.attemptedSend,false);assert.equal(cleared,1)
})

test('localized recipient labels match exact usernames without wildcard dots',async()=>{
 const {recipientLabel}=await import('./outreach-worker.mjs')
 assert.match('Abrir a página de perfil de lead.name',recipientLabel('lead.name'))
 assert.match('Open the profile page of lead.name',recipientLabel('lead.name'))
 assert.equal(recipientLabel('lead.name').test('Open the profile page of leadXname'),false)
})

function renderedConversation({persist=true,sender='obeliscoradical',duplicate=false,author='obeliscoradical',priorityChoice=false}={}) {
 let value='',text=duplicate?job.content:null,sent=false,reopened=0,ordinaryChosen=0
 const link={getAttribute:async()=>'/lead/'}
 const recipient={filter(){return this},first(){return this},waitFor:async()=>{},all:async()=>[link]}
 const composer={waitFor:async()=>{},count:async()=>1,fill:async v=>value=v,innerText:async()=>value,press:async()=>{text=value;value='';sent=true}}
 const senderLink={first(){return this},waitFor:async()=>{},getAttribute:async()=>`/${sender}/`}
 const page={
  goto:async url=>{if(url.includes('/direct/t/')&&sent){reopened++;if(!persist)text=null}},url:()=> 'https://www.instagram.com/lead/',
  getByRole:(role,{name}={})=>role==='button'&&name?.source?.includes('Enviar solicitação de contato')?{waitFor:async()=>{if(!priorityChoice)throw Error('no dialog')},count:async()=>1,click:async()=>ordinaryChosen++}:role==='button'?{first(){return this},waitFor:async()=>{},count:async()=>1,click:async()=>{}}:name?.source?.startsWith('^Foto')?senderLink:recipient,
  locator:selector=>selector.includes('contenteditable')?composer:{evaluateAll:async()=>['/direct/t/123/']},
  getByText:content=>({first(){return this},waitFor:async()=>{if(text!==content)throw Error('not rendered')},count:async()=>text===content?1:0,evaluate:async(fn,expected)=>author===expected}),
 }
 return {page,get reopened(){return reopened},get ordinaryChosen(){return ordinaryChosen}}
}

test('real adapter confirms only new text persisted after reopening the verified conversation',async()=>{
 const {chromeOutreachAdapter}=await import('./outreach-worker.mjs')
 const fixture=renderedConversation()
 const result=await sendOutreach(chromeOutreachAdapter(fixture.page,{expectedSender:'obeliscoradical'}),job,{authorize:async()=>true})
 assert.equal(result.status,'sent');assert.equal(fixture.reopened,1)
})

test('rendered text that disappears on reload is uncertain and never resent',async()=>{
 const {chromeOutreachAdapter}=await import('./outreach-worker.mjs')
 const fixture=renderedConversation({persist:false})
 const result=await sendOutreach(chromeOutreachAdapter(fixture.page,{expectedSender:'obeliscoradical'}),job,{authorize:async()=>true})
 assert.equal(result.status,'manual_review');assert.equal(fixture.reopened,1)
})

test('wrong connected account fails before typing or sending',async()=>{
 const {chromeOutreachAdapter}=await import('./outreach-worker.mjs')
 const fixture=renderedConversation({sender:'other'})
 const result=await sendOutreach(chromeOutreachAdapter(fixture.page,{expectedSender:'obeliscoradical'}),job,{authorize:async()=>true})
 assert.equal(result.status,'failed');assert.equal(result.attemptedSend,false)
})

test('incoming identical text cannot confirm an outgoing message',async()=>{
 const {chromeOutreachAdapter}=await import('./outreach-worker.mjs')
 const fixture=renderedConversation({author:'lead'})
 const result=await sendOutreach(chromeOutreachAdapter(fixture.page,{expectedSender:'obeliscoradical'}),job,{authorize:async()=>true})
 assert.equal(result.status,'manual_review')
})
test('partial fill failure clears pending text before Enter',async()=>{
 let cleared=0
 const result=await sendOutreach(adapter({fill:async()=>{throw Error('partial fill')},clear:async()=>cleared++}),job,{authorize:async()=>true})
 assert.equal(result.attemptedSend,false);assert.equal(cleared,1)
})

test('opens only the ordinary contact request when Instagram offers priority messaging',async()=>{
 const {chromeOutreachAdapter}=await import('./outreach-worker.mjs')
 const fixture=renderedConversation({priorityChoice:true})
 const result=await sendOutreach(chromeOutreachAdapter(fixture.page,{expectedSender:'obeliscoradical'}),job,{authorize:async()=>true})
 assert.equal(result.status,'sent');assert.equal(fixture.ordinaryChosen,1)
})
