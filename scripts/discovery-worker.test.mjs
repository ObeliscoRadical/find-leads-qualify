import test from 'node:test'
import assert from 'node:assert/strict'
import { profileFromUrl, uniqueProfiles, splitKeywords, normalizeSearch, segmentMatches } from './discovery-worker.mjs'
test('accepts only actual Instagram profile URLs, excludes content and external sites', () => {
  assert.equal(profileFromUrl('https://evil.example/company/'), null)
  assert.equal(profileFromUrl('https://www.instagram.com/p/abc/'), null)
  assert.equal(profileFromUrl('/explore/'), null)
  assert.equal(profileFromUrl('/direct/'), null)
  assert.equal(profileFromUrl('/company/extra'), null)
  assert.deepEqual(profileFromUrl('/Company.PT/'), { username: 'company.pt', profileUrl: 'https://www.instagram.com/company.pt/' })
})
test('deduplicates verified profile links without inventing profiles', () => {
  assert.equal(uniqueProfiles([]).length, 0)
  assert.deepEqual(uniqueProfiles([{href:'/company/',text:'company\nCompany Ltd\nSeguido(a) por alguém'}, {href:'/company/'}, {href:'/reel/abc/'}]), [{username:'company',profileUrl:'https://www.instagram.com/company/',displayName:'Company Ltd'}])
})

test('splits multiple requested segments instead of combining them into one search', () => {
 assert.deepEqual(splitKeywords('condominios, imobiliarias\n empresas; lojas'), ['condominios','imobiliarias','empresas','lojas'])
})

test('keeps only profiles actually opened before a challenge interrupts the search', async () => {
  const { discover } = await import('./discovery-worker.mjs')
  let current = 'https://www.instagram.com/'
  const textbox = { count: async () => 1, waitFor: async () => {}, fill: async () => {} }
  const page = {
    url: () => current,
    goto: async url => { current = url.includes('/second/') ? 'https://www.instagram.com/challenge/' : url },
    getByRole: () => textbox,
    waitForFunction: async () => {},
    locator: selector => ({
      count: async () => selector.startsWith('input') ? 0 : 1,
      first() { return this },
      waitFor: async () => {},
      innerText: async () => 'first 4 publicações 20 seguidores Empresa de condominios',
      evaluateAll: async () => [{ href: '/first/', text: 'first\nCondomínios de Portugal' }, { href: '/second/', text: 'second\nGestão de Condomínios' }],
    }),
  }
  await assert.rejects(discover(page, { keywords: 'condominios', location: 'Portugal', limit: 2 }), error => {
    assert.match(error.message, /confirmação humana/)
    assert.equal(error.profiles.length, 1)
    assert.equal(error.profiles[0].username, 'first')
    return true
  })
})


test('normalizes Instagram queries and rejects unrelated personalized suggestions', () => {
  assert.equal(normalizeSearch('Condomínios Portugal'), 'condominios portugal')
  assert.equal(segmentMatches('kingskidsportugal Kids', 'condomínios'), false)
  assert.equal(segmentMatches('graciebarra_portugal Jiu Jitsu', 'condomínios'), false)
  assert.equal(segmentMatches('cdportugal.pt Condomínios de Portugal', 'condomínios'), true)
  assert.equal(segmentMatches('administrarcondominios_pt Gestão de Condomínios', 'gestão de condomínios'), true)
  assert.equal(segmentMatches('empyrefitness_portugal Academia', 'gestão de condomínios'), false)
  assert.equal(segmentMatches('uma empresa', 'empresas'), false)
})

test('API calls send bounded requests and preserve auth failures', async () => {
  const { requestApi, terminalApiError } = await import('./discovery-worker.mjs')
  let options
  assert.deepEqual(await requestApi('https://example.test', 'secret', 'GET', undefined, { fetchImpl: async (_, opts) => { options = opts; return { ok: true, json: async () => ({job:null}) } } }), {job:null})
  assert.ok(options.signal instanceof AbortSignal)
  assert.equal(options.headers.Authorization, 'Bearer secret')
  await assert.rejects(requestApi('https://example.test', 'secret', 'GET', undefined, { fetchImpl: async () => ({ ok: false, status: 401 }) }), error => terminalApiError(error))
  assert.equal(terminalApiError({status:500}), false)
})

test('macOS service uses absolute paths, private config and throttled restarts', async () => {
  const { servicePlist } = await import('./discovery-service.mjs')
  const xml = servicePlist({ projectDir: '/Users/example/My & App', nodePath: '/absolute/node', configPath: '/private/config.json' })
  assert.match(xml, /My &amp; App/)
  assert.match(xml, /<integer>300<\/integer>/)
  assert.match(xml, /DISCOVERY_CONFIG/)
  assert.match(xml, /\/absolute\/node/)
  assert.throws(() => servicePlist({projectDir:'relative',nodePath:'/node',configPath:'/config'}), /absolutos/)
})

test('an unresponsive API request aborts instead of blocking the worker', async () => {
  const { requestApi } = await import('./discovery-worker.mjs')
  const fetchImpl = async (_, {signal}) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(resolve, 1000)
    signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason) }, {once:true})
  })
  await assert.rejects(requestApi('https://example.test', 'secret', 'GET', undefined, { fetchImpl, timeoutMs: 15 }), {name:'TimeoutError'})
})

test('read-only inbox diagnostic rejects mismatched profiles and never invents replies', async () => {
  const { inspectLeadThread, threadFromUrl } = await import('./discovery-inbox.mjs')
  assert.equal(threadFromUrl('https://evil.test/direct/t/123/'), null)
  assert.equal(threadFromUrl('https://www.instagram.com/direct/inbox/'), null)
  assert.equal(threadFromUrl('https://www.instagram.com/direct/t/123/'), 'https://www.instagram.com/direct/t/123/')
  let current
  const page = {
    goto: async url => { current=url }, url: () => current,
    getByRole: () => ({count:async()=>1,click:async()=>{ current='https://www.instagram.com/direct/t/123/' }}),
    waitForURL:async()=>{},
  }
  assert.equal((await inspectLeadThread(page,{instagramUsername:'wrong',instagramProfileUrl:'https://www.instagram.com/lead/'})).status, 'invalid_profile')
  const result = await inspectLeadThread(page,{instagramUsername:'lead',instagramProfileUrl:'https://www.instagram.com/lead/'})
  assert.equal(result.status,'manual_review_required')
  assert.equal(result.content,undefined)
  assert.equal(result.externalId,undefined)
})

test('known search results do not consume limits; segment fallback can discover a new profile', async () => {
  const {discover} = await import('./discovery-worker.mjs')
  let current, query
  const queries = [], visited = []
  const input = {count:async()=>1, waitFor:async()=>{}, fill:async value=>{query=value;queries.push(value)}}
  const page = {
    goto:async url=>{current=url;visited.push(url)},url:()=>current,getByRole:()=>input,waitForFunction:async()=>{},
    locator:selector=>({
      count:async()=>selector.startsWith('input')?0:1,first(){return this},waitFor:async()=>{},
      evaluateAll:async()=>query.includes('lisboa')?[{href:'/known/',text:'Condomínios'}]:[{href:'/new/',text:'Condomínios'}],
      innerText:async()=>current.includes('/new/')?'new 10 seguidores Condomínios em Portugal':'Nenhum resultado',
    }),
  }
  const result = await discover(page,{keywords:'condominios',location:'Lisboa',limit:1,existingUsernames:['known']})
  assert.deepEqual(queries,['condominios lisboa','condominios'])
  assert.equal(visited.includes('https://www.instagram.com/known/'),false)
  assert.equal(result[0].username,'new')
})

test('rotated credentials are persisted atomically privately without dropping configuration', async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const {persistRenewedToken} = await import('./discovery-worker.mjs')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'discovery-refresh-'))
  try {
    const config = path.join(dir,'config.json')
    await fs.writeFile(config,JSON.stringify({token:'old',apiUrl:'https://app.test',expectedInstagramUsername:'myaccount'}),{mode:0o600})
    await persistRenewedToken(config,'new')
    assert.deepEqual(JSON.parse(await fs.readFile(config,'utf8')),{token:'new',apiUrl:'https://app.test',expectedInstagramUsername:'myaccount'})
    assert.equal((await fs.stat(config)).mode & 0o077,0)
    assert.deepEqual(await fs.readdir(dir),['config.json'])
    await fs.chmod(config,0o644)
    await assert.rejects(persistRenewedToken(config,'rejected'),/privado/)
    assert.equal(JSON.parse(await fs.readFile(config,'utf8')).token,'new')
  } finally { await fs.rm(dir,{recursive:true,force:true}) }
})

test('API timeout override accommodates long preparation and still aborts',async()=>{
  const {requestApi} = await import('./discovery-worker.mjs')
  const fetchImpl=async(_, {signal})=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve({ok:true,json:async()=>({prepared:true})}),30)
    signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason)},{once:true})
  })
  assert.deepEqual(await requestApi('https://example.test','secret','GET',undefined,{fetchImpl,timeoutMs:80}),{prepared:true})
  await assert.rejects(requestApi('https://example.test','secret','GET',undefined,{fetchImpl,timeoutMs:5}),{name:'TimeoutError'})
})
