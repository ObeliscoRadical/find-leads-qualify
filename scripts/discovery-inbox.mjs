import { profileFromUrl } from './discovery-worker.mjs'
export function threadFromUrl(value) {
  try {
    const url = new URL(value)
    if (!['www.instagram.com', 'instagram.com'].includes(url.hostname) || url.protocol !== 'https:' || !/^\/direct\/t\/\d+\/?$/.test(url.pathname)) return null
    return `https://www.instagram.com${url.pathname.replace(/\/?$/, '/')}`
  } catch { return null }
}
// Read-only diagnostic: do not infer sender from alignment, colour or text.
// Instagram's rendered conversation currently lacks a verified stable message
// identifier and sender contract. Until an observed adapter exists, no ingest.
export async function inspectLeadThread(page, lead) {
  const profile = profileFromUrl(lead.instagramProfileUrl)
  const expected = String(lead.instagramUsername || '').replace(/^@/, '').toLowerCase()
  if (!profile || profile.username !== expected) return { username: expected, status: 'invalid_profile' }
  await page.goto(profile.profileUrl, {waitUntil:'domcontentloaded', timeout:45000})
  if (/\/accounts\/login|\/challenge|\/checkpoint/.test(page.url())) throw new Error('Instagram exige login ou confirmação humana antes de ler conversas.')
  const message = page.getByRole('button', {name:/^(Mensagem|Message|Enviar mensagem)$/i})
  if (await message.count() !== 1) return { username:expected, status:'thread_unavailable' }
  await message.click()
  try { await page.waitForURL(url => !!threadFromUrl(url.toString()), {timeout:15000}) } catch { return {username:expected,status:'thread_unavailable'} }
  const threadUrl = threadFromUrl(page.url())
  return { username:expected, threadUrl, status:'manual_review_required', reason:'A conversa abriu, mas remetente e identificador estável de cada mensagem não foram verificados; nenhuma resposta foi importada.' }
}
export async function inspectInbox(page, leads, {report = console.log} = {}) {
  const results = []
  for (const lead of leads.slice(0, 50)) {
    try {
      const result = await inspectLeadThread(page, lead)
      results.push(result)
      report(`Inbox @${result.username}: ${result.status}${result.reason ? ` — ${result.reason}` : ''}`)
    } catch (error) { report(error.message); break }
  }
  return results
}
