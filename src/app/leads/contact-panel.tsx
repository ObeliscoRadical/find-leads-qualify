'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { firstContactDraft, instagramContactUrl, leadAssessment, mergeMessageHistory, messageOriginLabel, replyDraftIdentity } from '@/lib/leads/contact'

type Lead = { id: string; contactName: string | null; instagramDisplayName: string | null; instagramUsername: string | null; instagramProfileUrl: string | null; noContact: boolean | null; noContactReason: string | null; leadStatus: string }
type ReplyDraft = { id: string; content: string; inboundMessageId: string; preparedAt: string; deliveryStatus: 'not_sent' }
type Message = { id: string; content: string; isFromLead: boolean; createdAt: string; sentVia?: string }
export default function ContactPanel({ lead, onUpdate }: { lead: Lead; onUpdate: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => firstContactDraft(lead.contactName || lead.instagramDisplayName || lead.instagramUsername || 'equipa'))
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [replyNotice, setReplyNotice] = useState('')
  const [replyConfirmed, setReplyConfirmed] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyEdited, setReplyEdited] = useState(false)
  const replyDraftKey = useRef<string | null>(null)
  const receiveReplyDraft = useCallback((next: ReplyDraft | null) => {
    const key = replyDraftIdentity(next)
    if (key !== replyDraftKey.current) {
      replyDraftKey.current = key
      setReplyText(''); setReplyEdited(false); setReplyConfirmed(false)
    }
    setReplyDraft(next)
  }, [])
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
    let loading = false
    const loadConversation = async () => {
      if (loading) return
      loading = true
      try {
        const [messagesResponse, draftResponse] = await Promise.all([
          fetch(`/api/leads/${lead.id}/messages`, { cache: 'no-store' }),
          fetch(`/api/leads/${lead.id}/reply-draft`, { cache: 'no-store' }),
        ])
        const messagesBody = await messagesResponse.json()
        const draftBody = await draftResponse.json()
        if (!active) return
        if (messagesResponse.ok) setHistory((items) => mergeMessageHistory(items, messagesBody.messages || []))
        else setNotice(messagesBody.error || 'Não foi possível carregar o histórico.')
        if (draftResponse.ok) receiveReplyDraft(draftBody.draft || null)
        else setReplyNotice(draftBody.error || 'Não foi possível carregar a resposta IA.')
      } catch { if (active) setNotice('Não foi possível atualizar a conversa. A deteção depende do conector ou da ligação Meta.') }
      finally { loading = false }
    }
    void loadConversation()
    const timer = setInterval(() => void loadConversation(), 15000)
    return () => { active = false; clearInterval(timer) }
  }, [lead.id, receiveReplyDraft])
  async function generateReply() {
    setGenerating(true); setReplyNotice('')
    try {
      const response = await fetch(`/api/leads/${lead.id}/reply-draft`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) { setReplyNotice(body.error || 'Não foi possível preparar a resposta.'); return }
      receiveReplyDraft(body.draft || null)
      setReplyEdited(false); setReplyConfirmed(false)
      setReplyNotice(body.draft ? 'Resposta preparada pela IA. Ainda não foi enviada.' : body.status === 'already_answered' ? 'A primeira resposta do cliente já foi atendida.' : body.status === 'needs_review' ? 'O cliente enviou outra mensagem. Reveja a conversa antes de responder.' : body.status === 'expired' ? 'A resposta recebida tem mais de 24 horas. Reveja a conversa antes de responder.' : 'Sem resposta elegível para preparar. Verifique o histórico e os bloqueios.')
    } catch { setReplyNotice('Sem conexão ao preparar a resposta.') }
    finally { setGenerating(false) }
  }
  async function recordReply() {
    if (!replyDraft || !replyConfirmed) return
    setSaving(true); setReplyNotice('')
    try {
      const response = await fetch(`/api/leads/${lead.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyEdited ? replyText : replyDraft.content, isFromLead: false, sentVia: 'manual', confirmedSent: true }),
      })
      const body = await response.json()
      if (!response.ok) { setReplyNotice(body.error || 'Não foi possível registar.'); return }
      setHistory((items) => mergeMessageHistory(items, [body.message]))
      receiveReplyDraft(null)
      setReplyNotice('Resposta manual registada. O app não enviou esta mensagem.')
      await onUpdate()
    } catch { setReplyNotice('Sem conexão. Verifique o histórico antes de repetir o registo.') }
    finally { setSaving(false) }
  }

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
    <p className="muted">Abra o perfil no Google Chrome com @obeliscoradical, confirme a empresa, clique em Mensagem, cole o texto e envie. Volte aqui para confirmar. Esta tela atualiza o histórico a cada 15 segundos; só mostra mensagens sincronizadas pelo conector ou pela Meta, ou registadas manualmente.</p>
    {blocked ? <p className="form-error">Contacto bloqueado: {lead.noContactReason || 'Sem contacto autorizado'}.</p> : url ? <a className="secondary-button" href={url} target="_blank" rel="noopener noreferrer">Abrir perfil Instagram</a> : <p className="muted">Este lead ainda não tem perfil Instagram válido.</p>}
    <label>Mensagem editável<textarea rows={5} value={draft} disabled={!!blocked} onChange={(event) => { setDraft(event.target.value); setConfirmed(false) }} /></label>
    <button type="button" className="secondary-button" disabled={!!blocked || !draft.trim()} onClick={async () => {
      try { await navigator.clipboard.writeText(draft); setNotice('Texto copiado. Envie no Instagram antes de confirmar.') }
      catch { setNotice('Selecione o texto e copie manualmente.') }
    }}>Copiar mensagem</button>
    <label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={!!blocked} onChange={(event) => setConfirmed(event.target.checked)} />Já enviei este texto no Instagram</label>
    <button type="button" className="primary-button" disabled={!!blocked || !confirmed || !draft.trim() || saving} onClick={() => void record(false)}>Registar envio manual</button>
    <p className="muted">As respostas devem aparecer no histórico após sincronização. Se faltar alguma, confira o Direct e registe apenas o texto real recebido abaixo.</p>
    <label>Resposta recebida<textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} /></label>
    <button type="button" className="secondary-button" disabled={!reply.trim() || saving} onClick={() => void record(true)}>Registar resposta real</button>
    {notice ? <p role="status">{notice}</p> : null}
    <h4>Resposta ao primeiro retorno do cliente</h4>
    <p className="muted">A IA analisa a resposta recebida e prepara uma abordagem com curiosidade e convite para visitar https://obeliscoradical.pt. Preparar ou copiar não envia mensagem.</p>
    <button type="button" className="secondary-button" disabled={!!blocked || generating || saving || !history.some((message) => message.isFromLead)} onClick={() => void generateReply()}>{generating ? 'IA a analisar resposta...' : 'Preparar primeira resposta com IA'}</button>
    {replyDraft ? <div>
      <p><strong>Rascunho IA — não enviado</strong></p>
      <label>Resposta editável<textarea rows={5} disabled={!!blocked} value={replyEdited ? replyText : replyDraft.content} onChange={(event) => { setReplyText(event.target.value); setReplyEdited(true); setReplyConfirmed(false) }} /></label>
      <button type="button" className="secondary-button" disabled={!!blocked || !(replyEdited ? replyText : replyDraft.content).trim()} onClick={async () => {
        try { await navigator.clipboard.writeText(replyEdited ? replyText : replyDraft.content); setReplyNotice('Resposta copiada. Envie no Instagram antes de confirmar.') }
        catch { setReplyNotice('Selecione o texto e copie manualmente.') }
      }}>Copiar resposta IA</button>
      <label className="checkbox-row"><input type="checkbox" disabled={!!blocked} checked={replyConfirmed} onChange={(event) => setReplyConfirmed(event.target.checked)} />Já enviei esta resposta no Instagram</label>
      <button type="button" className="primary-button" disabled={!!blocked || !replyConfirmed || saving || !(replyEdited ? replyText : replyDraft.content).trim()} onClick={() => void recordReply()}>Registar resposta manual enviada</button>
    </div> : null}
    {replyNotice ? <p role="status">{replyNotice}</p> : null}
    <h4>Histórico registado</h4>
    {history.length ? history.map((message) => <article key={message.id}><strong>{messageOriginLabel(message)}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p><small>{new Date(message.createdAt).toLocaleString('pt-PT')}</small></article>) : <p className="muted">Sem mensagens registadas.</p>}
  </section>
}
