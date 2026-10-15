'use client'

import { useEffect, useState } from 'react'
import { firstContactDraft, instagramContactUrl, leadAssessment, mergeMessageHistory, messageOriginLabel } from '@/lib/leads/contact'

type Lead = { id: string; contactName: string | null; instagramDisplayName: string | null; instagramUsername: string | null; instagramProfileUrl: string | null; noContact: boolean | null; noContactReason: string | null; leadStatus: string }
type Message = { id: string; content: string; isFromLead: boolean; createdAt: string; sentVia?: string }
export default function ContactPanel({ lead, onUpdate }: { lead: Lead; onUpdate: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => firstContactDraft(lead.contactName || lead.instagramDisplayName || lead.instagramUsername || 'equipa'))
  const [reply, setReply] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [history, setHistory] = useState<Message[]>([])
  const [bio, setBio] = useState('')
  const [assessment, setAssessment] = useState<ReturnType<typeof leadAssessment>>(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const blocked = lead.noContact || lead.leadStatus === 'opted_out'
  const url = instagramContactUrl(lead.instagramProfileUrl, lead.instagramUsername)
  useEffect(() => {
    let active = true
    fetch(`/api/leads/${lead.id}`).then(async (response) => {
      if (!response.ok) return
      const body = await response.json()
      if (active) { setBio(body.lead?.instagramBio || ''); setAssessment(leadAssessment(body.lead?.sourceFields)) }
    }).catch(() => { /* history request supplies connection errors */ })
    fetch(`/api/leads/${lead.id}/messages`).then(async (response) => {
      const body = await response.json()
      if (active) { if (response.ok) setHistory((items) => mergeMessageHistory(items, body.messages || [])); else setNotice(body.error || 'Não foi possível carregar o histórico.') }
    }).catch(() => { if (active) setNotice('Não foi possível carregar o histórico.') })
    return () => { active = false }
  }, [lead.id])
  async function record(isFromLead: boolean) {
    setSaving(true); setNotice('')
    try {
      const response = await fetch(`/api/leads/${lead.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: isFromLead ? reply : draft, isFromLead, sentVia: 'manual', confirmedSent: confirmed }),
      })
      const body = await response.json()
      if (!response.ok) { setNotice(body.error || 'Não foi possível guardar.'); return }
      setHistory((items) => mergeMessageHistory(items, [body.message]))
      setConfirmed(false)
      if (isFromLead) setReply('')
      setNotice(isFromLead ? 'Resposta real registada.' : 'Envio manual registado. O app não enviou esta mensagem.')
      await onUpdate()
    } catch { setNotice('Sem conexão. Verifique o histórico antes de repetir o registo.') }
    finally { setSaving(false) }
  }
  return <section className="form">
    <h3>Primeiro contacto e conversa</h3>
    {assessment ? <div><p>{assessment.locationEvidence === 'confirmed' ? 'Região confirmada' : 'Região por confirmar'}{assessment.requiresReview ? ' · Rever adequação' : ''}</p>{assessment.reasons.map((reason) => <p key={reason} className="muted">{reason}</p>)}</div> : null}
    {bio ? <p style={{ whiteSpace: 'pre-wrap' }}><strong>Bio do perfil para revisão:</strong> {bio}</p> : null}
    <p className="muted">Abra o perfil no Google Chrome com @obeliscoradical, confirme a empresa, clique em Mensagem, cole o texto e envie. Volte aqui para confirmar. Não há envio nem leitura automática de Direct nesta tela.</p>
    {blocked ? <p className="form-error">Contacto bloqueado: {lead.noContactReason || 'Sem contacto autorizado'}.</p> : url ? <a className="secondary-button" href={url} target="_blank" rel="noopener noreferrer">Abrir perfil Instagram</a> : <p className="muted">Este lead ainda não tem perfil Instagram válido.</p>}
    <label>Mensagem editável<textarea rows={5} value={draft} disabled={!!blocked} onChange={(event) => { setDraft(event.target.value); setConfirmed(false) }} /></label>
    <button type="button" className="secondary-button" disabled={!!blocked || !draft.trim()} onClick={async () => {
      try { await navigator.clipboard.writeText(draft); setNotice('Texto copiado. Envie no Instagram antes de confirmar.') }
      catch { setNotice('Selecione o texto e copie manualmente.') }
    }}>Copiar mensagem</button>
    <label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={!!blocked} onChange={(event) => setConfirmed(event.target.checked)} />Já enviei este texto no Instagram</label>
    <button type="button" className="primary-button" disabled={!!blocked || !confirmed || !draft.trim() || saving} onClick={() => void record(false)}>Registar envio manual</button>
    <p className="muted">Aguarde a resposta no Direct do Chrome. Quando chegar, copie o texto real abaixo para acompanhar no aplicativo.</p>
    <label>Resposta recebida<textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} /></label>
    <button type="button" className="secondary-button" disabled={!reply.trim() || saving} onClick={() => void record(true)}>Registar resposta real</button>
    {notice ? <p role="status">{notice}</p> : null}
    <h4>Histórico registado</h4>
    {history.length ? history.map((message) => <article key={message.id}><strong>{messageOriginLabel(message)}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p><small>{new Date(message.createdAt).toLocaleString('pt-PT')}</small></article>) : <p className="muted">Sem mensagens registadas.</p>}
  </section>
}
