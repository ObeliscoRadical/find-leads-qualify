import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '@/lib/env'
import { getMetaOAuthUrl, getMetaSettingsUrl } from '@/lib/meta/client'

describe('Meta OAuth URLs', () => {
  beforeEach(() => {
    vi.stubEnv('META_REDIRECT_URI', 'https://find-leads-qualify.onrender.com/api/meta/oauth/callback')
    resetEnvCache()
  })

  it('returns all callback outcomes to the configured public origin', () => {
    for (const status of ['connected', 'expired', 'denied', 'provider_error', 'no_pages']) {
      const url = getMetaSettingsUrl(status)
      expect(url.origin).toBe('https://find-leads-qualify.onrender.com')
      expect(url.pathname).toBe('/settings/meta')
      expect(url.searchParams.get('meta')).toBe(status)
    }
  })

  it('requests Page listing and basic Instagram access with the original state', () => {
    const url = getMetaOAuthUrl('fresh-state', true)
    expect(url.searchParams.get('scope')).toBe('pages_show_list,instagram_basic,business_management,pages_read_engagement,leads_retrieval,pages_manage_metadata,pages_manage_ads')
    expect(url.searchParams.get('state')).toBe('fresh-state')
    expect(url.searchParams.get('redirect_uri')).toBe('https://find-leads-qualify.onrender.com/api/meta/oauth/callback')
  })
})
