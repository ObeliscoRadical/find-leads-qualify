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
