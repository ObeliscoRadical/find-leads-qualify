import { expect, it } from 'vitest'
import { instagramContactUrl, leadAssessment, mergeMessageHistory } from './contact'
it('uses a stored Instagram profile without guessing a Direct recipient', () => {
  expect(instagramContactUrl('https://www.instagram.com/empresa.pt/', null)).toBe('https://www.instagram.com/empresa.pt/')
  expect(instagramContactUrl(null, 'empresa.pt')).toBe('https://www.instagram.com/empresa.pt/')
  expect(instagramContactUrl('javascript:alert(1)', null)).toBeNull()
  expect(instagramContactUrl('https://evil.example/empresa/', null)).toBeNull()
  expect(instagramContactUrl('https://www.instagram.com/direct/', null)).toBeNull()
  expect(instagramContactUrl(null, 'name/../../direct')).toBeNull()
})

it('rejects reserved username, credentials, queries and mismatched stored profile', () => {
  for (const value of ['https://www.instagram.com/direct/', 'https://user:pass@www.instagram.com/empresa/', 'https://www.instagram.com/empresa/?next=elsewhere', 'https://www.instagram.com/other/']) expect(instagramContactUrl(value, 'empresa')).toBeNull()
  expect(instagramContactUrl(null, 'direct')).toBeNull()
})
it('parses evidence honestly and handles malformed source fields', () => {
  expect(leadAssessment('{oops')).toBeNull()
  expect(leadAssessment(JSON.stringify({ assessment: { locationEvidence: 'unknown', reasons: ['Review', 2] } }))).toEqual({ locationEvidence: 'unverified', requiresReview: true, reasons: ['Review'] })
})
it('merges a late initial history response without losing new records or duplicating messages', () => {
  const older = { id: 'old', createdAt: '2026-10-10T10:00:00Z' }
  const newer = { id: 'new', createdAt: '2026-10-11T10:00:00Z' }
  expect(mergeMessageHistory([newer], [older, newer])).toEqual([older, newer])
})
