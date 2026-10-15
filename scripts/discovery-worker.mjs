import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
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
export function normalizeSearch(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() }
const stopwords = new Set(['gestao', 'gestor', 'gestores', 'empresa', 'empresas', 'servico', 'servicos', 'para', 'portugal', 'lisboa', 'porto'])
export function segmentMatches(text, keyword) {
  const terms = normalizeSearch(keyword).split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !stopwords.has(word))
  if (!terms.length) return false
  const normalized = normalizeSearch(text)
  return terms.some(term => normalized.includes(term.slice(0, Math.max(5, term.length - 3))))
}
function cleanDisplayName(text, username) {
  return String(text || '').split(/\n/).map(line => line.trim()).filter(line => line && normalizeSearch(line) !== normalizeSearch(username) && !/seguido|followed|seguir|follow/i.test(line)).join(' ').slice(0, 160) || username
}
export function uniqueProfiles(links) {
  const found = new Map()
  for (const link of links) { const profile = profileFromUrl(link.href); if (profile && !found.has(profile.username)) found.set(profile.username, { ...profile, displayName: cleanDisplayName(link.text, profile.username) }) }
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
  const existing = new Set((job.existingUsernames || []).map(value => String(value).toLowerCase()))
  const keywords = splitKeywords(job.keywords)
  if (!keywords.length) throw new Error('A busca precisa de pelo menos um segmento.')
  try {
  for (const keyword of keywords) {
    if (profiles.size >= job.limit) break
    const query = normalizeSearch([keyword, job.location].filter(Boolean).join(' '))
    if (!segmentMatches(keyword, keyword)) throw new Error('Informe um segmento específico, como condomínios ou imobiliárias, em vez de termos genéricos.')
    job.assertActive?.()
    await page.goto('https://www.instagram.com/explore/', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await guard(page)
    let input = page.getByRole('textbox', { name: /Entrada da pesquisa|Search input/i })
    if (!await input.count()) {
      const search = page.getByRole('link', { name: /Pesquisar|Search/i }).first()
      if (await search.count()) await search.click()
      input = page.locator('input[placeholder="Pesquisar"], input[placeholder="Search"], input[aria-label="Entrada da pesquisa"], input[aria-label="Search input"]').first()
    }
    await input.waitFor({ state: 'visible', timeout: 15000 })
    const sourceUrl = page.url()
    let candidates = []
    for (const searchQuery of [...new Set([query, normalizeSearch(keyword)])]) {
    await input.fill(searchQuery)
    const deadline = Date.now() + 25000
    while (Date.now() < deadline) {
      job.assertActive?.()
      await guard(page)
      const links = await page.locator('main a[href]').evaluateAll(nodes => nodes.map(a => ({ href: a.href, text: a.innerText })))
      candidates = uniqueProfiles(links).filter(candidate => !existing.has(candidate.username) && !profiles.has(candidate.username) && segmentMatches(`${candidate.username} ${candidate.displayName}`, keyword))
      if (candidates.length) break
      const mainText = await page.locator('main').innerText()
      if (/nenhum resultado|no results|nao encontramos|não encontramos/i.test(mainText)) break
      await delay(1000)
    }
    if (candidates.length) break
    }
    // Each candidate must be an actual profile shown in Instagram's search and opened successfully.
    for (const candidate of candidates) {
      if (profiles.size >= job.limit) break
      if (profiles.has(candidate.username) || existing.has(candidate.username)) continue
      job.assertActive?.()
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
      if (!segmentMatches(`${candidate.username} ${text}`, keyword)) continue
      profiles.set(candidate.username, { ...candidate, bio: text.slice(0, 1800), sourceUrl })
      await delay(2000)
    }
  }
  } catch (error) { error.profiles = [...profiles.values()]; throw error }
  return [...profiles.values()]
}
export async function requestApi(endpoint, token, method, body, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const response = await fetchImpl(endpoint, { method, signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  if (!response.ok) { const error = new Error(`API de descoberta respondeu ${response.status}; confira a conexão do worker no aplicativo.`); error.status = response.status; throw error }
  return response.json()
}
export async function persistRenewedToken(configPath, token) {
  if (typeof token !== 'string' || !token) throw new Error('Token renovado inválido.')
  const stat = await fs.lstat(configPath)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('A configuração deve ser um arquivo privado com permissões 600.')
  const saved = JSON.parse(await fs.readFile(configPath, 'utf8'))
  const temp = `${configPath}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temp, JSON.stringify({ ...saved, token }, null, 2) + '\n', {mode:0o600, flag:'wx'})
    await fs.rename(temp, configPath)
  } finally { await fs.rm(temp, {force:true}) }
}
export function outreachAuthorized(settings, now = Date.now()) {
  return settings.automaticOutreachEnabled === true && (!settings.outreachAuthorizedUntil || now < Date.parse(settings.outreachAuthorizedUntil))
}
export function terminalApiError(error) { return [401, 403].includes(error?.status) }
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
  let stopping = false
  let page
  let closePromise
  const closeBrowser = () => closePromise ||= (browser ? page?.close().catch(() => {}) : context.close().catch(() => {}))
  const requestStop = () => { stopping = true; void closeBrowser() }
  process.once('SIGTERM', requestStop)
  process.once('SIGINT', requestStop)
  page = await context.newPage()
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' })
  await delay(3000)
  console.log('Chrome dedicado aberto. Entre no Instagram nele; envios dependem de ativação explícita local e no aplicativo.')
  if (loginOnly) {
    console.log('Login manual: mantenha esta janela aberta. Depois execute npm run discovery:worker para processar buscas.')
    await new Promise(resolve => context.on('close', resolve))
    return
  }
  let connectedUsername
  async function verifyAccount() {
    await guard(page)
    const accountLink = page.getByRole('link', { name: /^Foto do perfil de |^Profile picture of /i }).first()
    await accountLink.waitFor({ state: 'visible', timeout: 15000 })
    const account = profileFromUrl(await accountLink.getAttribute('href'))
    if (!account) throw new Error('Não foi possível identificar a conta conectada no Chrome. Abra a página inicial do Instagram.')
    const expected = normalizeSearch(settings.expectedInstagramUsername || '').replace(/^@/, '')
    if (expected && account.username !== expected) throw new Error('A conta conectada no Chrome não corresponde à conta configurada. Troque a conta manualmente antes de buscar.')
    connectedUsername = account.username
    console.log(`Instagram conectado: @${connectedUsername}`)
  }
  const inspection = process.argv.find(value => value.startsWith('--inspect-outreach='))
  if (inspection) {
    await verifyAccount()
    const profile = profileFromUrl(`https://www.instagram.com/${inspection.split('=')[1]}/`)
    if (!profile || profile.username === connectedUsername) throw new Error('Perfil de inspeção inválido.')
    const {chromeOutreachAdapter} = await import('./outreach-worker.mjs')
    try {
      const result = await chromeOutreachAdapter(page,{expectedSender:settings.expectedInstagramUsername}).openConversation(profile)
      console.log(JSON.stringify({inspection:true,sender:connectedUsername,...result}))
    } finally { await closeBrowser() }
    return
  }
  const endpoint = new URL('/api/discovery/worker', settings.apiUrl)
  async function api(method, body) {
    return requestApi(endpoint, settings.token, method, body)
  }
  let lastInboxCheck = 0
  let lastOutreachNotice = ''
  while (!stopping) {
    try { await guard(page) } catch (error) { console.log(error.message); if (process.argv.includes('--once')) { process.exitCode = 1; break }; await delay(10000); continue }
    let claimed
    let heartbeat
    let heartbeatStopped = false
    let heartbeatPromise = Promise.resolve()
    let heartbeatPending = false
    let leaseError
    async function stopHeartbeat() { heartbeatStopped = true; if (heartbeat) clearInterval(heartbeat); await heartbeatPromise }
    try {
      const { job, monitoredLeads = [], renewedToken } = await api('GET')
      claimed = job
      if (renewedToken) {
        settings.token = renewedToken
        if (process.env.DISCOVERY_CONFIG) {
          try {
            await persistRenewedToken(process.env.DISCOVERY_CONFIG, renewedToken)
            console.log('Credencial de descoberta renovada com o mesmo acesso.')
          } catch { console.warn('Credencial renovada nesta sessão, mas não foi possível preservar no arquivo protegido. Corrija a configuração antes de reiniciar.') }
        } else console.warn('Credencial renovada nesta sessão; configure DISCOVERY_CONFIG privado para preservar a renovação após reiniciar.')
      }
      if (process.argv.includes('--inspect-inbox') && !job && monitoredLeads.length && Date.now() - lastInboxCheck >= 300000) {
        lastInboxCheck = Date.now()
        await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 })
        await verifyAccount()
        const { inspectInbox } = await import('./discovery-inbox.mjs')
        await inspectInbox(page, monitoredLeads)
      }
      if (!job) {
        if (outreachAuthorized(settings) && !stopping) {
          const outreachEndpoint = new URL('/api/outreach/worker', settings.apiUrl)
          const {job: outbound,lastError:outreachNotice} = await requestApi(outreachEndpoint, settings.token, 'GET', undefined, {timeoutMs:100000})
          if (outreachNotice && outreachNotice !== lastOutreachNotice) console.log(`Primeiro contacto em espera: ${outreachNotice}`)
          lastOutreachNotice = outreachNotice || ''
          if (outbound) {
            let outcome
            try {
              if (!settings.expectedInstagramUsername) throw new Error('Configure a conta remetente esperada antes de enviar.')
              await page.goto('https://www.instagram.com/', {waitUntil:'domcontentloaded',timeout:45000})
              await verifyAccount()
              const {sendOutreach, chromeOutreachAdapter} = await import('./outreach-worker.mjs')
              const result = await sendOutreach(chromeOutreachAdapter(page,{expectedSender:connectedUsername}), {instagramUsername:outbound.username,instagramProfileUrl:outbound.profileUrl,content:outbound.message}, {authorize: async () => {
                const authorized = await requestApi(outreachEndpoint, settings.token, 'PATCH', {jobId:outbound.id,claimToken:outbound.claimToken})
                return authorized.authorized === true
              }})
              if (result.status === 'sent') {
                try {
                  const evidenceDir = path.resolve('.discovery/evidence')
                  await fs.mkdir(evidenceDir,{recursive:true,mode:0o700})
                  const anchor = page.getByRole('link',{name:new RegExp(`(?:Open the profile page of|Abrir a página de perfil de) ${outbound.username.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)}).first()
                  const box = await anchor.boundingBox()
                  const size = page.viewportSize()
                  const clip = box && size ? {x:Math.max(0,Math.floor(box.x-20)),y:0,width:size.width-Math.max(0,Math.floor(box.x-20)),height:size.height} : undefined
                  if (!clip) throw new Error('Recorte da conversa indisponível.')
                  const evidence = path.join(evidenceDir,`${outbound.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.png`)
                  await page.screenshot({path:evidence,...(clip?{clip}:{})})
                  await fs.chmod(evidence,0o600)
                  console.log(`Comprovativo do contacto @${outbound.username} guardado em .discovery/evidence.`)
                } catch { console.warn('Mensagem confirmada; comprovativo visual não ficou disponível.') }
              }
              outcome = {attemptedSend:result.attemptedSend,outcome:result.status === 'sent' ? 'sent' : result.status === 'manual_review' ? 'uncertain' : 'failed', ...(result.threadUrl ? {threadUrl:result.threadUrl} : {}), ...(result.error ? {error:result.error} : {})}
            } catch (error) { outcome = {outcome:'uncertain',attemptedSend:true,error:String(error.message).slice(0,500)} }
            await requestApi(outreachEndpoint, settings.token, 'POST', {jobId:outbound.id,claimToken:outbound.claimToken,...outcome})
            console.log(`Primeiro contato @${outbound.username}: ${outcome.outcome}; confira o histórico no aplicativo.`)
          }
        }
        if (process.argv.includes('--once')) break
        await delay(10000)
        continue
      }
      claimed = job
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 })
      await verifyAccount()
      heartbeat = setInterval(() => {
        if (heartbeatStopped || heartbeatPending) return
        heartbeatPending = true
        heartbeatPromise = api('PATCH', { jobId: job.id, claimToken: job.claimToken })
          .catch(error => { if (error.status === 409 || terminalApiError(error)) leaseError = error; if (!heartbeatStopped) console.error(error.message) })
          .finally(() => { heartbeatPending = false })
      }, 30000)
      console.log('Busca de perfis reais iniciada no Instagram.')
      const profiles = await discover(page, { ...job, limit: Math.min(Math.max(Number(job.limit) || 10, 1), 30), assertActive: () => { if (leaseError) throw leaseError } })
      await stopHeartbeat()
      if (leaseError) throw leaseError
      const result = await api('POST', { jobId: job.id, claimToken: job.claimToken, profiles })
      if (!profiles.length) console.log('Instagram não mostrou perfis públicos verificáveis para esta busca. Ajuste os segmentos e a localização no aplicativo.')
      console.log(`Busca concluída: ${result.inserted ?? 0} novos perfis, ${result.existing ?? 0} já cadastrados.`)
    } catch (error) {
      await stopHeartbeat()
      console.error(error.message)
      if (terminalApiError(error)) { console.error('Worker pausado: renove a conexão no aplicativo e reinicie o serviço.'); process.exitCode = 0; break }
      if (process.argv.includes('--once')) process.exitCode = 1
      if (claimed && !leaseError) { try { await api('POST', { jobId: claimed.id, claimToken: claimed.claimToken, profiles: error.profiles || [], error: String(error.message).slice(0, 500) }) } catch (reportError) { console.error(reportError.message) } }
    }
    await stopHeartbeat()
    if (process.argv.includes('--once')) break
    await delay(10000)
  }
  await closeBrowser()
  process.removeListener('SIGTERM', requestStop)
  process.removeListener('SIGINT', requestStop)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
