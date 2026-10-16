import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { profileFromUrl } from './discovery-worker.mjs'
export function threadFromUrl(value) {
  try {
    const url = new URL(value)
    if (!['www.instagram.com', 'instagram.com'].includes(url.hostname) || url.protocol !== 'https:' || !/^\/direct\/t\/\d+\/?$/.test(url.pathname)) return null
    return `https://www.instagram.com${url.pathname.replace(/\/?$/, '/')}`
  } catch { return null }
}
// A DOM row index or React element id is not a message identity. Only an
// absolute timestamp scoped to the same author's unique text is eligible.
export function verifiedInboundMessages(rows, {username, threadUrl, expectedSender}) {
  const thread = threadFromUrl(threadUrl)
  if (!thread || !username || !expectedSender || username === expectedSender) return []
  const candidates = rows.filter(row => row.author === username && typeof row.content === 'string' && row.content.trim() && row.content.trim().length <= 10000 && typeof row.datetime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.datetime) && Number.isFinite(Date.parse(row.datetime)))
  const signature = row => JSON.stringify([thread,username,row.content.trim(),new Date(row.datetime).toISOString()])
  return candidates.filter(row => candidates.filter(other => signature(other) === signature(row)).length === 1).map(row => ({username,threadUrl:thread,content:row.content.trim(),receivedAt:new Date(row.datetime).toISOString(),externalId:`ig-dom-v1:${createHash('sha256').update(signature(row)).digest('hex')}`}))
}
export async function readConversationRows(page) {
  return page.locator('[role="article"][aria-roledescription="message"]').evaluateAll(articles => articles.map(article => {
    const group = article.closest('[role="group"]')
    if (!group || group.querySelectorAll('[role="article"]').length !== 1) return {}
    const authors = [...new Set(Array.from(group.querySelectorAll('[aria-label]')).map(node => {
      const label = node.getAttribute('aria-label') || ''
      return /^(?:Responda à mensagem de ([\w.]+)|Reply to ([\w.]+)'s message)$/.exec(label)?.slice(1).find(Boolean)?.toLowerCase()
    }).filter(Boolean))]
    const times = Array.from(group.querySelectorAll('time[datetime]')).map(node => node.getAttribute('datetime'))
    // article text is message content; action buttons live outside the article.
    return {author:authors.length === 1 ? authors[0] : null,content:article.innerText,datetime:times.length === 1 ? times[0] : null}
  }))
}
export async function inspectLeadThread(page, lead, {expectedSender,sequenceStateDir = '.discovery/inbox-sequences'} = {}) {
  const profile = profileFromUrl(lead.instagramProfileUrl)
  const expected = String(lead.instagramUsername || '').replace(/^@/, '').toLowerCase()
  if (!profile || profile.username !== expected) return {username:expected,status:'invalid_profile'}
  if (!expectedSender || expectedSender !== 'obeliscoradical') return {username:expected,status:'manual_review_required',reason:'Conta esperada não verificada.',messages:[]}
  // Reuse the verified sender/recipient adapter, but never fill or send.
  const {chromeOutreachAdapter} = await import('./outreach-worker.mjs')
  const adapter = chromeOutreachAdapter(page,{expectedSender})
  const {threadUrl} = await adapter.openConversation(profile)
  await adapter.assertConversation()
  const rows = await readConversationRows(page)
  const first = verifiedInboundMessages(rows,{username:expected,threadUrl,expectedSender})
  if (!first.length && !lead.contactAnchor) return {username:expected,threadUrl,status:rows.some(row=>row.author===expected)?'manual_review_required':'no_verified_reply',reason:'Sem resposta com autoria e timestamp absoluto único verificáveis.',messages:[]}
  await page.goto(threadUrl,{waitUntil:'domcontentloaded',timeout:45000})
  await adapter.assertConversation()
  const reopenedRows = await readConversationRows(page)
  if (lead.contactAnchor) {
    const filename=await sequenceStateFile(expected,threadUrl,lead.contactAnchor.id,sequenceStateDir)
    const sequence=verifiedReplySequence(rows,reopenedRows,{username:expected,threadUrl,expectedSender,anchor:lead.contactAnchor,previous:await loadSequenceState(filename)})
    if (!sequence.state) return {username:expected,threadUrl,status:'manual_review_required',reason:sequence.reason,messages:[]}
    await persistSequenceState(filename,sequence.state)
    return {username:expected,threadUrl,status:sequence.messages.length?(sequence.replyBlocked?'verified_reply_readonly':'verified_reply'):'no_verified_reply',replyBlocked:sequence.replyBlocked,reason:sequence.reason,messages:sequence.messages}
  }
  const reopened = verifiedInboundMessages(reopenedRows,{username:expected,threadUrl,expectedSender})
  const messages = first.filter(message=>reopened.some(other=>other.externalId===message.externalId))
  return {username:expected,threadUrl,status:messages.length?'verified_reply':'manual_review_required',messages}
}

export async function inspectInbox(page, leads, {expectedSender,ingest,prepareDraft,diagnosticsEnabled = false,diagnosticsDir,sequenceStateDir,report = console.log} = {}) {
  const results = []
  for (const lead of leads.slice(0,50)) {
    try {
      const result = await inspectLeadThread(page,lead,{expectedSender,sequenceStateDir})
      results.push(result)
      if (diagnosticsEnabled && result.threadUrl) {
        try { await saveInboxDiagnostics(page,result,{directory:diagnosticsDir}); report(`Inbox @${result.username}: diagnóstico privado guardado.`) }
        catch { report(`Inbox @${result.username}: diagnóstico privado indisponível.`) }
      }
      await importReplyBatch(result.messages || [],{ingest,prepareDraft:result.status === 'verified_reply' && !result.replyBlocked ? prepareDraft : undefined})
      // A Meta webhook can already have persisted the customer's reply. DOM
      // timestamp availability must not gate preparation of that server history.
      if (lead.leadStatus === 'replied' && lead.id && !result.replyBlocked && result.status === 'no_verified_reply' && !(result.messages || []).length && prepareDraft) await prepareDraft(lead.id)
      report(`Inbox @${result.username}: ${result.status}`)
    } catch (error) {
      report(`Inbox @${lead.instagramUsername}: revisão necessária — ${error.message}`)
      results.push({username:lead.instagramUsername,status:'manual_review_required',reason:error.message,messages:[]})
      if (stopInboxInspection(error)) break
    }
  }
  return results
}

export async function importReplyBatch(messages, {ingest,prepareDraft} = {}) {
  if (!ingest) return
  const leads = new Set()
  // Persist the whole observed conversation before generating: a split client
  // reply must be analysed together, rather than drafting from its first row.
  for (const message of messages) {
    const saved = await ingest(message)
    if (saved.leadId) leads.add(saved.leadId)
  }
  // On replay retry preparation as well, so a failed IA request does not lose
  // the persisted reply. The server owns draft idempotency and expiry.
  if (prepareDraft) for (const leadId of leads) await prepareDraft(leadId)
}

export function stopInboxInspection(error) {
  if ([401,403].includes(error?.status)) return true
  const message = String(error?.message || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  return /(?:conta.*(?:mudou|nao corresponde|nao verificada)|conta remetente|conta esperada|login|challenge|checkpoint|confirmacao humana|autorizacao|credencial.*(?:invalida|expirada))/.test(message)
}

// Diagnostics are rendered DOM only, scoped to message groups of the verified
// conversation. Never include inbox rows, storage, network data or hidden state.
export async function saveInboxDiagnostics(page, result, {directory = '.discovery/inbox-evidence'} = {}) {
  if (!/^[a-z0-9_.]{1,30}$/.test(result.username) || !threadFromUrl(result.threadUrl) || threadFromUrl(page.url()) !== result.threadUrl) throw Error('Conversa de diagnóstico inválida.')
  const {recipientLabel} = await import('./outreach-worker.mjs')
  const header = page.getByRole('link',{name:recipientLabel(result.username)}).filter({has:page.getByRole('heading')})
  if (await header.count() !== 1 || profileFromUrl(await header.getAttribute('href'))?.username !== result.username) throw Error('Destinatário do diagnóstico mudou.')
  const articles = await page.locator('[role="article"][aria-roledescription="message"]').evaluateAll(nodes => nodes.map(article => {
    const group = article.closest('[role="group"]')
    const attrs = node => node ? Object.fromEntries(Array.from(node.attributes).filter(attribute => /^(?:id|role|aria-|data-)/.test(attribute.name)).map(attribute => [attribute.name,attribute.value])) : null
    return {articleAttributes:attrs(article),content:article.innerText,groupAttributes:attrs(group),times:Array.from((group || article).querySelectorAll('time')).map(node=>({text:node.innerText,attributes:Object.fromEntries(Array.from(node.attributes).map(attribute=>[attribute.name,attribute.value]))})),authorLabels:Array.from((group || article).querySelectorAll('[aria-label]')).map(node=>node.getAttribute('aria-label')).filter(label=>/Responda.*mensagem|Reply to .*message/i.test(label || ''))}
  }))
  const dir = path.resolve(directory)
  await fs.mkdir(dir,{recursive:true,mode:0o700})
  const stat = await fs.lstat(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Pasta de diagnóstico insegura.')
  await fs.chmod(dir,0o700)
  async function save(extension,content) {
    const temporary = path.join(dir,`.${result.username}.${randomUUID()}.tmp`)
    try {
      await fs.writeFile(temporary,content,{mode:0o600,flag:'wx'})
      await fs.rename(temporary,path.join(dir,`${result.username}.${extension}`))
    } finally { await fs.rm(temporary,{force:true}) }
  }
  await save('json',JSON.stringify({observedAt:new Date().toISOString(),username:result.username,threadUrl:result.threadUrl,status:result.status,articles},null,2)+'\n')
  // The recipient header is inside the conversation to the right of the inbox.
  // Cropping at its left edge may omit part of a bubble, but never expose inbox.
  const box = await header.boundingBox()
  const viewport = page.viewportSize()
  if (box && viewport && box.x >= viewport.width * 0.25 && box.x < viewport.width && box.y >= 0) {
    const x = Math.ceil(box.x)
    await save('png',await page.screenshot({clip:{x,y:0,width:viewport.width-x,height:viewport.height}}))
  }
  return {articleCount:articles.length}
}

// When Instagram omits times and message ids, identity comes from an immutable
// observed sequence anchored to a server-confirmed outgoing message, not an
// arbitrary viewport position. Any truncation/edit/deletion requires review.
export function verifiedReplySequence(rows, reopenedRows, {username,threadUrl,expectedSender,anchor,previous,forSending = false,now = Date.now()}) {
  const thread = threadFromUrl(threadUrl)
  const anchorTime = Date.parse(anchor?.createdAt)
  if (!thread || !anchor?.id || typeof anchor.content !== 'string' || !Number.isFinite(anchorTime) || anchorTime > now || (forSending && now-anchorTime > 86400000) || !username || !expectedSender || username===expectedSender) return {reason:'invalid_or_expired_anchor',messages:[]}
  const canonical = list => {
    const matches = list.map((row,index)=>row.author===expectedSender && row.content?.trim()===anchor.content.trim()?index:-1).filter(index=>index>=0)
    if (matches.length !== 1) return null
    const suffix = list.slice(matches[0]).map(row=>({author:row.author,content:typeof row.content==='string'?row.content.trim():null}))
    if (suffix.some(row=>![username,expectedSender].includes(row.author) || !row.content || row.content.length>10000)) return null
    return suffix
  }
  const prefix = canonical(rows), reopened = canonical(reopenedRows)
  if (!prefix || !reopened || JSON.stringify(prefix)!==JSON.stringify(reopened)) return {reason:'missing_ambiguous_or_changed_sequence',messages:[]}
  if (previous && (previous.threadUrl!==thread || previous.anchorId!==anchor.id || !Array.isArray(previous.prefix) || previous.prefix.length>prefix.length || previous.prefix.some((row,index)=>JSON.stringify(row)!==JSON.stringify(prefix[index])))) return {reason:'previous_sequence_edited_or_deleted',messages:[]}
  const answered=prefix.slice(1).some(row=>row.author===expectedSender)
  if (forSending && answered) return {reason:'conversation_already_answered',messages:[]}
  const expired=now-anchorTime>86400000
  const observedAt = new Date(now).toISOString()
  const messages = prefix.flatMap((row,ordinal)=> row.author===username ? [{username,threadUrl:thread,content:row.content,externalId:`ig-sequence-v1:${createHash('sha256').update(JSON.stringify([thread,anchor.id,ordinal,row.author,row.content])).digest('hex')}`,observedAt,receivedAfter:new Date(anchorTime).toISOString(),timestampEstimated:true,anchorMessageId:anchor.id,sequenceOrdinal:ordinal,requiresHumanReview:answered}] : [])
  return {state:{threadUrl:thread,anchorId:anchor.id,prefix},messages,replyBlocked:answered || expired,reason:answered?'conversation_already_answered':expired?'conservative_window_expired':undefined}
}
async function sequenceStateFile(username,threadUrl,anchorId,directory) {
  const dir=path.resolve(directory)
  await fs.mkdir(dir,{recursive:true,mode:0o700})
  const stat=await fs.lstat(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Pasta de sequência insegura.')
  await fs.chmod(dir,0o700)
  return path.join(dir,`${username}_${createHash('sha256').update(`${threadUrl}:${anchorId}`).digest('hex')}.json`)
}
async function loadSequenceState(filename) {
  try {
    const stat=await fs.lstat(filename)
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)!==0) throw Error('Estado de sequência não privado.')
    return JSON.parse(await fs.readFile(filename,'utf8'))
  } catch(error) {if(error.code==='ENOENT')return undefined;throw error}
}
async function persistSequenceState(filename,state) {
  const temporary=`${filename}.${randomUUID()}.tmp`
  try {await fs.writeFile(temporary,JSON.stringify(state)+'\n',{mode:0o600,flag:'wx'});await fs.rename(temporary,filename)}
  finally {await fs.rm(temporary,{force:true})}
}

export async function readStoredReplySequence(username,threadUrl,anchorId,directory='.discovery/inbox-sequences') {
  if (!/^[a-z0-9_.]{1,30}$/.test(username) || !threadFromUrl(threadUrl) || !anchorId) throw Error('Prova de sequência inválida.')
  return loadSequenceState(await sequenceStateFile(username,threadUrl,anchorId,directory))
}
