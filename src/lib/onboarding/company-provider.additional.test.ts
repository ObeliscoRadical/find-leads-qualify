import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isValidPortugueseNif,
  ViesCompanyProvider,
  CompanyLookupUnavailableError,
  getCompanyLookupProvider,
  normalizeVatNumber,
} from '@/lib/onboarding/company-provider'

describe('Company Provider - Additional Tests', () => {
  describe('isValidPortugueseNif - edge cases', () => {
    it('accepts all zeros (valid checksum)', () => {
      // The algorithm accepts 000000000 as valid checksum
      expect(isValidPortugueseNif('000000000')).toBe(true)
    })

    it('rejects all same digits (except zeros)', () => {
      expect(isValidPortugueseNif('111111111')).toBe(false)
      expect(isValidPortugueseNif('999999999')).toBe(false)
    })

    it('accepts known valid NIFs', () => {
      expect(isValidPortugueseNif('501442600')).toBe(true)
    })

    it('rejects single digit changes', () => {
      expect(isValidPortugueseNif('501442601')).toBe(false)
      expect(isValidPortugueseNif('501442602')).toBe(false)
      expect(isValidPortugueseNif('501442609')).toBe(false)
    })
  })

  describe('normalizeVatNumber', () => {
    it('strips PT prefix', () => {
      expect(normalizeVatNumber('PT501442600')).toBe('501442600')
      expect(normalizeVatNumber('pt501442600')).toBe('501442600')
    })

    it('strips non-digits', () => {
      expect(normalizeVatNumber('PT 501 442 600')).toBe('501442600')
      expect(normalizeVatNumber('501-442-600')).toBe('501442600')
    })

    it('returns null for invalid length', () => {
      expect(normalizeVatNumber('123')).toBeNull()
      expect(normalizeVatNumber('PT123')).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(normalizeVatNumber(undefined)).toBeNull()
    })
  })

  describe('ViesCompanyProvider - timeout handling', () => {
    it('throws on fetch timeout', async () => {
      const provider = new ViesCompanyProvider(async () => {
        await new Promise((_, reject) => setTimeout(() => reject(new DOMException('timeout', 'AbortError')), 10))
      }, 5)
      await expect(provider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)
    })

    it('throws on network error', async () => {
      const provider = new ViesCompanyProvider(async () => {
        throw new TypeError('Network error')
      })
      await expect(provider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)
    })

    it('respects custom timeout via AbortController', async () => {
      let abortCalled = false
      const provider = new ViesCompanyProvider(async (url, options) => {
        // Simulate slow response that gets aborted
        await new Promise((_, reject) => {
          const timeout = setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 50)
          options?.signal?.addEventListener('abort', () => {
            clearTimeout(timeout)
            abortCalled = true
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }, 10)

      await expect(provider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)
      expect(abortCalled).toBe(true)
    })
  })

  describe('ViesCompanyProvider - response validation', () => {
    it('returns null for isValid: false', async () => {
      const provider = new ViesCompanyProvider(async () =>
        new Response(JSON.stringify({ isValid: false, vatNumber: '501442600' }), { status: 200 })
      )
      const result = await provider.lookup('501442600')
      expect(result).toBeNull()
    })

    it('throws for missing name when isValid: true', async () => {
      const provider = new ViesCompanyProvider(async () =>
        new Response(JSON.stringify({ isValid: true, vatNumber: '501442600' }), { status: 200 })
      )
      await expect(provider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)
    })

    it('throws for empty name', async () => {
      const provider = new ViesCompanyProvider(async () =>
        new Response(JSON.stringify({ isValid: true, name: '   ', vatNumber: '501442600' }), { status: 200 })
      )
      await expect(provider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)
    })

    it('throws for non-200 status', async () => {
      const provider = new ViesCompanyProvider(async () =>
        new Response('Service Unavailable', { status: 503 })
      )
      await expect(provider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)
    })

    it('throws for invalid JSON', async () => {
      const provider = new ViesCompanyProvider(async () =>
        new Response('not json', { status: 200 })
      )
      await expect(provider.lookup('501442600')).rejects.toThrow(CompanyLookupUnavailableError)
    })

    it('normalizes vatNumber from response', async () => {
      const provider = new ViesCompanyProvider(async () =>
        new Response(JSON.stringify({ isValid: true, name: 'Test Company', vatNumber: 'PT501442600' }), { status: 200 })
      )
      const result = await provider.lookup('501442600')
      expect(result?.nif).toBe('501442600')
    })

    it('falls back to input NIF if vatNumber missing', async () => {
      const provider = new ViesCompanyProvider(async () =>
        new Response(JSON.stringify({ isValid: true, name: 'Test Company' }), { status: 200 })
      )
      const result = await provider.lookup('501442600')
      expect(result?.nif).toBe('501442600')
    })
  })

  describe('getCompanyLookupProvider', () => {
    it('returns ViesCompanyProvider instance', () => {
      const provider = getCompanyLookupProvider()
      expect(provider).toBeInstanceOf(ViesCompanyProvider)
    })
  })
})