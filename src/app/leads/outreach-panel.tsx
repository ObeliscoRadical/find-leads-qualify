'use client'
import { useCallback, useEffect, useState } from 'react'
type Job = {id:string;status:string;lastError:string|null;payload:{username?:string;businessType?:string;reason?:string;message?:string}}
const statuses: Record<string,string> = {classifying:'IA a analisar',ready:'Preparado para envio',running:'Chrome a enviar',completed:'Enviado e confirmado',rejected:'IA não selecionou',failed:'Falha na IA',manual_review:'Verificar manualmente — sem reenvio'}
export default function OutreachPanel() {
  const [config,setConfig] = useState({enabled:false,maxDaily:5})
  const [ready,setReady] = useState(false)
  const [jobs,setJobs] = useState<Job[]>([])
  const [notice,setNotice] = useState('')
  const [saving,setSaving] = useState(false)
  const load = useCallback(async () => {
    try { const response = await fetch('/api/outreach'); const body = await response.json(); if (!response.ok) {setNotice(body.error || 'Falha ao carregar envio automático.');return} setConfig(body.config);setReady(body.providerReady);setJobs(body.jobs || []) }
    catch { setNotice('Sem conexão com o envio automático.') }
  },[])
  useEffect(() => { const initial = setTimeout(() => void load(),0); const timer = setInterval(() => void load(),15000);return () => {clearTimeout(initial);clearInterval(timer)} },[load])
  async function save(enabled: boolean) {
    setSaving(true);setNotice('')
    try { const response = await fetch('/api/outreach',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...config,enabled})}); const body = await response.json(); if (!response.ok) {setNotice(body.error || 'Não foi possível ativar.');return} setConfig(body.config);setNotice(enabled ? 'IA verificada. O Chrome fará os primeiros contactos automaticamente no horário configurado.' : 'Primeiros contactos automáticos desligados.') }
    catch {setNotice('Sem conexão. Verifique o estado antes de repetir.')} finally {setSaving(false)}
  }
  return <section className="form"><h2>Primeiro contacto automático com IA</h2>
    <p className="muted">A IA analisa a bio real, identifica condomínios, empresas de limpeza, imobiliárias ou escritórios e prepara uma mensagem elétrica adaptada. Empresas de limpeza podem receber proposta de parceria de apoio elétrico. O Chrome envia uma única primeira mensagem e regista apenas o envio confirmado.</p>
    <p>{config.enabled ? 'Ativo no servidor' : 'Desligado no servidor'} · {ready ? 'Chave IA disponível no servidor' : 'Configure a chave da IA no servidor'}</p>
    <label>Limite de primeiros contactos por dia (1 a 5)<input type="number" min="1" max="5" value={config.maxDaily} onChange={(event) => setConfig({...config,maxDaily:Number(event.target.value)})} /></label>
    <button type="button" className="primary-button" disabled={saving || (!config.enabled && !ready)} onClick={() => void save(!config.enabled)}>{saving ? 'A verificar IA...' : config.enabled ? 'Desligar primeiros contactos' : 'Verificar IA e ativar primeiros contactos'}</button>
    <p className="muted">O Mac e o Chrome dedicado precisam de estar ligados e o envio automático também precisa de estar autorizado na configuração local do conector. Ativar no servidor não altera essa autorização local. Horário padrão 09h–20h de Lisboa, com intervalo mínimo de 90 segundos. Falhas ou envios incertos ficam para revisão manual e nunca são reenviados automaticamente. Respostas chegam ao Instagram vinculado. Histórico automático no app depende da conexão Meta com permissões de mensagens. Sem resposta automática do bot. Até 20 perfis por dia podem ser analisados pela IA, mantendo separado o limite de mensagens.</p>
    {notice ? <p role="status">{notice}</p> : null}
    {jobs.map((job) => <details key={job.id}><summary>@{job.payload.username || 'perfil'} · {statuses[job.status] || job.status}</summary>{job.payload.businessType ? <p>Tipo identificado pela IA: {job.payload.businessType}</p> : null}{job.payload.reason ? <p>{job.payload.reason}</p> : null}{job.payload.message ? <p style={{whiteSpace:'pre-wrap'}}>{job.payload.message}</p> : null}{job.lastError ? <p className="form-error">{job.lastError}</p> : null}</details>)}
  </section>
}
