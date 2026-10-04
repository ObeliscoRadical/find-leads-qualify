import { describe, it, expect, vi } from 'vitest'
import {
  CompanyLookupUnavailableError,
  ViesCompanyProvider,
  isValidPortugueseNif,
} from './company-provider'

describe('Portuguese NIF validation', () => {
  it('accepts only 9 digits with a valid module 11 checksum', () => {
    expect(isValidPortugueseNif('501442600')).toBe(true)
    expect(isValidPortugueseNif('501442601')).toBe(false)
    expect(isValidPortugueseNif('98074297')).toBe(false)
    expect(isValidPortugueseNif('9807429740')).toBe(false)
    expect(isValidPortugueseNif('980 742 974')).toBe(false)
  })
})

describe('ViesCompanyProvider', () => {
  it('normalizes a registered Portuguese company without fabricating missing fields', async () => {
    const provider = new ViesCompanyProvider(async (url) => {
      expect(String(url)).toBe('https://ec.europa.eu/taxation_customs/vies/rest-api/ms/PT/vat/501442600')
      return new Response(
        JSON.stringify({
          isValid: true,
          name: 'EMPRESA EXEMPLO, LDA',
          vatNumber: '501442600',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })

    const result = await provider.lookup('501442600')
    expect(result).toEqual({
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

    const result = await provider.lookup('501442601')
    expect(result).toBeNull()
    expect(called).toBe(false)
  })

  it('returns null when VIES says the NIF is not registered', async () => {
    const provider = new ViesCompanyProvider(async () => {
      return new Response(JSON.stringify({ isValid: false, vatNumber: '501442600' }), { status: 200 })
    })

    const result = await provider.lookup('501442600')
    expect(result).toBeNull()
  })

  it('raises an availability error for timeout, network errors, invalid JSON, or bad VIES status', async () => {
    const timeoutProvider = new ViesCompanyProvider(async () => {
      throw new DOMException('timed out', 'AbortError')
    })
    await expect(timeoutProvider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)

    const invalidJsonProvider = new ViesCompanyProvider(async () => new Response('not-json', { status: 200 }))
    await expect(invalidJsonProvider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)

    const badStatusProvider = new ViesCompanyProvider(async () => new Response('{}', { status: 503 }))
    await expect(badStatusProvider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)
  })
})