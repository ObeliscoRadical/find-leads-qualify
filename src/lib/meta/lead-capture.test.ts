import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hasCaptureScopes, mapFormLead, validMetaSignature } from './lead-capture'

describe('Meta capture integrity', () => {
  it('accepts only a signature for the exact raw body', () => {
    const raw = Buffer.from('{"entry":[]}')
    const signature = `sha256=${createHmac('sha256', 'secret').update(raw).digest('hex')}`
    expect(validMetaSignature(raw, signature, 'secret')).toBe(true)
    expect(validMetaSignature(Buffer.from('{ "entry": [] }'), signature, 'secret')).toBe(false)
    expect(validMetaSignature(raw, signature, 'other')).toBe(false)
    for (const invalid of [null, '', 'sha256=a', `sha1=${'0'.repeat(64)}`]) expect(validMetaSignature(raw, invalid, 'secret')).toBe(false)
  })
  it('maps form fields without fabricating Instagram profiles', () => {
    const mapped = mapFormLead({ id: '123', form_id: '99', field_data: [
      { name: 'full_name', values: ['Ana Silva'] }, { name: 'email', values: ['ana@example.com'] },
      { name: 'phone_number', values: ['+351900000000'] }, { name: 'servico', values: ['Eletricidade'] },
    ] })
    expect(mapped.sourceExternalId).toBe('123')
    expect(mapped.sourceType).toBe('meta_lead_ads')
    expect(mapped.contactEmail).toBe('ana@example.com')
    expect(mapped.contactPhone).toBe('+351900000000')
    expect(mapped.contactWhatsapp).toBeNull()
    expect(mapped.sourceFields).toContain('Eletricidade')
    expect(mapped.contactName).toBe('Ana Silva')
    expect(mapped).not.toHaveProperty('instagramId')
  })
  it('rejects invalid contact email and requires all capture permissions', () => {
    expect(mapFormLead({ id: '1', field_data: [{ name: 'email', values: ['invalid'] }] }).contactEmail).toBeNull()
    expect(hasCaptureScopes('["leads_retrieval"]')).toBe(false)
    expect(hasCaptureScopes('invalid')).toBe(false)
    expect(hasCaptureScopes('["leads_retrieval","pages_manage_metadata","pages_manage_ads"]')).toBe(true)
  })
})
