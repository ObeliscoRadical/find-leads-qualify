import { describe, expect, it } from 'vitest'
import { requestsOptOut, validateReplyDraft } from './draft'
describe('first customer reply safeguards', () => {
  it('recognises refusals without mistaking a request for more information', () => {
    for (const text of ['Não me contactem mais','Remova o meu contacto','Sem interesse','Não estamos interessados','STOP']) expect(requestsOptOut(text)).toBe(true)
    expect(requestsOptOut('Pode enviar mais informação sobre os serviços?')).toBe(false)
  })
  it('requires the authorised website and a question without invented promises', () => {
    expect(validateReplyDraft('Obrigado! Podemos conversar sobre apoio elétrico aos imóveis? Conheça https://obeliscoradical.pt.')).toContain('obeliscoradical.pt')
    for (const text of ['Conheça o nosso trabalho, podemos conversar?', 'Visite https://evil.pt e https://obeliscoradical.pt, sim?', 'Garantimos resultados. Conheça https://obeliscoradical.pt, sim?']) expect(() => validateReplyDraft(text)).toThrow()
  })
})
