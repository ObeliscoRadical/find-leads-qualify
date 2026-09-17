import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CompanyLookupUnavailableError,
  ViesCompanyProvider,
  isValidPortugueseNif,
} from './company-provider.ts'

describe('Portuguese NIF validation', () => {
  it('accepts only 9 digits with a valid module 11 checksum', () => {
    assert.equal(isValidPortugueseNif('501442600'), true)
    assert.equal(isValidPortugueseNif('501442601'), false)
    assert.equal(isValidPortugueseNif('98074297'), false)
    assert.equal(isValidPortugueseNif('9807429740'), false)
    assert.equal(isValidPortugueseNif('980 742 974'), false)
  })
})

describe('ViesCompanyProvider', () => {
  it('normalizes a registered Portuguese company without fabricating missing fields', async () => {
    const provider = new ViesCompanyProvider(async (url) => {
      assert.equal(String(url), 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/PT/vat/501442600')
      return new Response(
        JSON.stringify({
          isValid: true,
          name: 'EMPRESA EXEMPLO, LDA',
          vatNumber: '501442600',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })

    assert.deepEqual(await provider.lookup('501442600'), {
      name: 'EMPRESA EXEMPLO, LDA',
      nif: '501442600',
      provider: 'EU VIES',
    })
  })

  it('returns null for invalid checksum before calling VIES', async () => {
    let called = false
    const provider = new ViesCompanyProvider(async () => {
      called = true
      return new Response('{}')
    })

    assert.equal(await provider.lookup('501442601'), null)
    assert.equal(called, false)
  })

  it('returns null when VIES says the NIF is not registered', async () => {
    const provider = new ViesCompanyProvider(async () => {
      return new Response(JSON.stringify({ isValid: false, vatNumber: '501442600' }), { status: 200 })
    })

    assert.equal(await provider.lookup('501442600'), null)
  })

  it('raises an availability error for timeout, network errors, invalid JSON, or bad VIES status', async () => {
    const timeoutProvider = new ViesCompanyProvider(async () => {
      throw new DOMException('timed out', 'AbortError')
    })
    await assert.rejects(() => timeoutProvider.lookup('501442600'), CompanyLookupUnavailableError)

    const invalidJsonProvider = new ViesCompanyProvider(async () => new Response('not-json', { status: 200 }))
    await assert.rejects(() => invalidJsonProvider.lookup('501442600'), CompanyLookupUnavailableError)

    const badStatusProvider = new ViesCompanyProvider(async () => new Response('{}', { status: 503 }))
    await assert.rejects(() => badStatusProvider.lookup('501442600'), CompanyLookupUnavailableError)
  })
})
