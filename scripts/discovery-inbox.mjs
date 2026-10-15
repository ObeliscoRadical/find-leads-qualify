import { createHash } from 'node:crypto'
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
export async function inspectLeadThread(page, lead, {expectedSender} = {}) {
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
  if (!first.length) return {username:expected,threadUrl,status:rows.some(row=>row.author===expected)?'manual_review_required':'no_verified_reply',reason:'Sem resposta com autoria e timestamp absoluto único verificáveis.',messages:[]}
  // Reopening proves that the signature persists and was not a transient row.
  await page.goto(threadUrl,{waitUntil:'domcontentloaded',timeout:45000})
  await adapter.assertConversation()
  const reopened = verifiedInboundMessages(await readConversationRows(page),{username:expected,threadUrl,expectedSender})
  const messages = first.filter(message=>reopened.some(other=>other.externalId===message.externalId))
  return {username:expected,threadUrl,status:messages.length?'verified_reply':'manual_review_required',messages}
}
export async function inspectInbox(page, leads, {expectedSender,ingest,prepareDraft,report = console.log} = {}) {
  const results = []
  for (const lead of leads.slice(0,50)) {
    try {
      const result = await inspectLeadThread(page,lead,{expectedSender})
      results.push(result)
      await importReplyBatch(result.messages || [],{ingest,prepareDraft})
      // A Meta webhook can already have persisted the customer's reply. DOM
      // timestamp availability must not gate preparation of that server history.
      if (lead.leadStatus === 'replied' && lead.id && !(result.messages || []).length && prepareDraft) await prepareDraft(lead.id)
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
