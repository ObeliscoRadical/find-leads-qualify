import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const reserved = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts', 'about', 'privacy', 'legal'])
export function profileFromUrl(value) {
  try {
    const url = new URL(value, 'https://www.instagram.com')
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname)) return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 1 || !/^[a-zA-Z0-9_.]{1,30}$/.test(parts[0]) || reserved.has(parts[0].toLowerCase())) return null
    return { username: parts[0].toLowerCase(), profileUrl: `https://www.instagram.com/${parts[0].toLowerCase()}/` }
  } catch { return null }
}
export function uniqueProfiles(links) {
  const found = new Map()
  for (const link of links) { const profile = profileFromUrl(link.href); if (profile && !found.has(profile.username)) found.set(profile.username, { ...profile, displayName: link.text?.trim().slice(0, 160) }) }
  return [...found.values()]
}
export function splitKeywords(value) { return (Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/)).map(item => String(item).trim()).filter(Boolean) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function guard(page) {
  const url = page.url()
  if (/\/accounts\/login|\/challenge|\/checkpoint/.test(url)) throw new Error('Instagram precisa de login ou confirmação humana. Abra o Chrome dedicado e resolva antes de continuar.')
  const login = page.locator('input[name="username"]')
  if (await login.count()) throw new Error('Faça login no Instagram no Chrome dedicado para continuar.')
}
export async function discover(page, job) {
  const profiles = new Map()
  const keywords = splitKeywords(job.keywords)
  if (!keywords.length) throw new Error('A busca precisa de pelo menos um segmento.')
  try {
  for (const keyword of keywords) {
    if (profiles.size >= job.limit) break
    const query = [keyword, job.location].filter(Boolean).join(' ')
    await page.goto('https://www.instagram.com/explore/', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await guard(page)
    let input = page.getByRole('textbox', { name: /Entrada da pesquisa|Search input/i })
    if (!await input.count()) {
      const search = page.getByRole('link', { name: /Pesquisar|Search/i }).first()
      if (await search.count()) await search.click()
      input = page.locator('input[placeholder="Pesquisar"], input[placeholder="Search"], input[aria-label="Entrada da pesquisa"], input[aria-label="Search input"]').first()
    }
    await input.waitFor({ state: 'visible', timeout: 15000 })
    await input.fill(query)
    await delay(3500)
    await guard(page)
    const sourceUrl = page.url()
    const links = await page.locator('main a[href]').evaluateAll(nodes => nodes.map(a => ({ href: a.href, text: a.innerText })))
    const candidates = uniqueProfiles(links)
    // Each candidate must be an actual profile shown in Instagram's search and opened successfully.
    for (const candidate of candidates) {
      if (profiles.size >= job.limit) break
      if (profiles.has(candidate.username)) continue
      await page.goto(candidate.profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await guard(page)
      const main = page.locator('main')
      await main.waitFor({ state: 'visible', timeout: 15000 })
      await page.waitForFunction(username => {
        const text = document.querySelector('main')?.innerText || ''
        return /Sorry, this page isn't available|Esta página não está disponível|Esta conta é privada|This account is private/i.test(text) || (text.toLowerCase().includes(username) && /seguidores|followers/i.test(text))
      }, candidate.username, { timeout: 15000 })
      const profileText = await main.innerText()
      if (/Sorry, this page isn't available|Esta página não está disponível|Esta conta é privada|This account is private/i.test(profileText)) continue
      const header = page.locator('main header').first()
      const text = await (await header.count() ? header : main).innerText()
      if (/Sorry, this page isn't available|Esta página não está disponível|Esta conta é privada|This account is private/i.test(text)) continue
      // A rendered profile includes its username and a posts/followers header. No synthetic fallback.
      if (!profileText.toLowerCase().includes(candidate.username) || !/seguidores|followers/i.test(profileText)) continue
      profiles.set(candidate.username, { ...candidate, bio: text.slice(0, 1800), sourceUrl })
      await delay(2000)
    }
  }
  } catch (error) { error.profiles = [...profiles.values()]; throw error }
  return [...profiles.values()]
}
async function config() {
  let saved = {}
  if (process.env.DISCOVERY_CONFIG) {
    const stat = await fs.stat(process.env.DISCOVERY_CONFIG)
    if ((stat.mode & 0o077) !== 0) throw new Error('O arquivo DISCOVERY_CONFIG deve ter permissões 600.')
    saved = JSON.parse(await fs.readFile(process.env.DISCOVERY_CONFIG, 'utf8'))
  }
  const result = { ...saved, apiUrl: process.env.DISCOVERY_API_URL || saved.apiUrl || saved.appUrl, token: process.env.DISCOVERY_WORKER_TOKEN || saved.token, cdpUrl: process.env.DISCOVERY_CDP_URL || saved.cdpUrl }
  if (!result.apiUrl || !result.token) throw new Error('Configure apiUrl e token num arquivo protegido ou nas variáveis DISCOVERY_API_URL/DISCOVERY_WORKER_TOKEN.')
  const api = new URL(result.apiUrl)
  if (api.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(api.hostname)) throw new Error('A API remota deve usar HTTPS.')
  if (result.cdpUrl && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(result.cdpUrl).hostname)) throw new Error('O Chrome CDP deve estar no próprio computador.')
  return result
}
async function main() {
  const loginOnly = process.argv.includes('--login')
  const settings = loginOnly ? {} : await config()
  const { chromium } = await import('playwright-core')
  let browser, context
  if (settings.cdpUrl) { browser = await chromium.connectOverCDP(settings.cdpUrl); context = browser.contexts()[0] }
  else {
    const profileDir = path.resolve(settings.profileDir || '.discovery/chrome')
    await fs.mkdir(profileDir, { recursive: true, mode: 0o700 })
    context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: false })
  }
  const page = await context.newPage()
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' })
  console.log('Chrome dedicado aberto. Entre no Instagram nele; o worker só busca perfis e não envia mensagens.')
  if (loginOnly) {
    console.log('Login manual: mantenha esta janela aberta. Depois execute npm run discovery:worker para processar buscas.')
    await new Promise(resolve => context.on('close', resolve))
    return
  }
  const endpoint = new URL('/api/discovery/worker', settings.apiUrl)
  async function api(method, body) {
    const response = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${settings.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    if (!response.ok) throw new Error(`API de descoberta respondeu ${response.status}; confira a conexão do worker no aplicativo.`)
    return response.json()
  }
  while (true) {
    try { await guard(page) } catch (error) { console.log(error.message); await delay(10000); continue }
    let claimed
    let heartbeat
    try {
      const { job } = await api('GET')
      if (!job) { if (process.argv.includes('--once')) break; await delay(10000); continue }
      claimed = job
      heartbeat = setInterval(() => {
        void api('PATCH', { jobId: job.id, claimToken: job.claimToken })
          .catch(error => console.error(error.message))
      }, 30000)
      console.log('Busca de perfis reais iniciada no Instagram.')
      const profiles = await discover(page, { ...job, limit: Math.min(Math.max(Number(job.limit) || 10, 1), 30) })
      const result = await api('POST', { jobId: job.id, claimToken: job.claimToken, profiles })
      if (!profiles.length) console.log('Instagram não mostrou perfis públicos verificáveis para esta busca. Ajuste os segmentos e a localização no aplicativo.')
      console.log(`Busca concluída: ${result.inserted ?? 0} novos perfis, ${result.existing ?? 0} já cadastrados.`)
    } catch (error) {
      console.error(error.message)
      if (claimed) { try { await api('POST', { jobId: claimed.id, claimToken: claimed.claimToken, profiles: error.profiles || [], error: String(error.message).slice(0, 500) }) } catch (reportError) { console.error(reportError.message) } }
    }
    if (heartbeat) clearInterval(heartbeat)
    if (process.argv.includes('--once')) break
    await delay(10000)
  }
  await page.close()
  if (!browser) await context.close()
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
