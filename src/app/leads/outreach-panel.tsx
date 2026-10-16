'use client'
import { useCallback, useEffect, useState } from 'react'
type Config = {enabled:boolean;maxDaily:number;dateOverride?:{date:string;maxDaily:number;minIntervalSeconds:number}|null}
type Effective = {enabled:boolean;maxDaily:number;minIntervalSeconds:number;overrideActive:boolean}
type Job = {id:string;status:string;lastError:string|null;payload:{username?:string;businessType?:string;reason?:string;message?:string}}
function todayOverrideWindow() {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date())
  const part = (type:string) => parts.find(value=>value.type===type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}` === '2026-10-16' && Number(part('hour')) >= 9 && Number(part('hour')) < 20
}
const statuses: Record<string,string> = {classifying:'IA a analisar',ready:'Preparado para envio',running:'Chrome a enviar',completed:'Enviado e confirmado',rejected:'IA não selecionou',failed:'Falha na IA',manual_review:'Verificar manualmente — sem reenvio',not_sent:'Envio não iniciado — rever perfil'}
export default function OutreachPanel() {
  const [config,setConfig] = useState<Config>({enabled:false,maxDaily:5})
  const [effective,setEffective] = useState<Effective>({enabled:false,maxDaily:5,minIntervalSeconds:90,overrideActive:false})
  const [todayOverrideAvailable,setTodayOverrideAvailable] = useState(false)
  const [ready,setReady] = useState(false)
  const [providerState,setProviderState] = useState<{paused:boolean;retryAt:string|null;message:string|null}|null>(null)
  const [jobs,setJobs] = useState<Job[]>([])
  const [notice,setNotice] = useState('')
  const [saving,setSaving] = useState(false)
  const load = useCallback(async () => {
    setTodayOverrideAvailable(todayOverrideWindow())
    try { const response = await fetch('/api/outreach'); const body = await response.json(); if (!response.ok) {setNotice(body.error || 'Falha ao carregar envio automático.');return} setConfig(body.config);if(body.effectiveConfig)setEffective(body.effectiveConfig);setReady(body.providerReady);setProviderState(body.providerState || null);setJobs(body.jobs || []) }
    catch { setNotice('Sem conexão com o envio automático.') }
  },[])
  useEffect(() => { const initial = setTimeout(() => void load(),0); const timer = setInterval(() => void load(),15000);return () => {clearTimeout(initial);clearInterval(timer)} },[load])
  async function saveConfig(nextConfig: Config) {
    setSaving(true);setNotice('')
    try { const response = await fetch('/api/outreach',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(nextConfig)}); const body = await response.json(); if (!response.ok) {setNotice(body.error || 'Não foi possível ativar.');return} setConfig(body.config);if(body.effectiveConfig)setEffective(body.effectiveConfig);setNotice(nextConfig.enabled ? 'IA verificada. O Chrome fará os primeiros contactos automaticamente no horário configurado.' : 'Primeiros contactos automáticos desligados.') }
    catch {setNotice('Sem conexão. Verifique o estado antes de repetir.')} finally {setSaving(false)}
  }
  return <section className="form"><h2>Primeiro contacto automático com IA</h2>
    <p className="muted">A IA analisa a bio real, identifica condomínios, empresas de limpeza, imobiliárias ou escritórios e prepara uma mensagem elétrica adaptada. Empresas de limpeza podem receber proposta de parceria de apoio elétrico. O Chrome envia uma única primeira mensagem e regista apenas o envio confirmado.</p>
    <p>{config.enabled ? 'Ativo no servidor' : 'Desligado no servidor'} · {ready ? 'Chave IA disponível no servidor' : 'Configure a chave da IA no servidor'}</p>
    {providerState?.paused ? <p role="alert">Análises pausadas: {providerState.message} Nova verificação: {providerState.retryAt ? new Date(providerState.retryAt).toLocaleString('pt-PT',{timeZone:'Europe/Lisbon'}) : 'automática'} (Lisboa).</p> : null}
    <p>Limite efetivo: {effective.maxDaily} contactos/dia · intervalo mínimo {effective.minIntervalSeconds} segundos. {effective.overrideActive ? 'Exceção autorizada somente em 16/10/2026, das 09h às 20h de Lisboa.' : config.dateOverride ? 'Exceção fora da validade: envios suspensos até nova autorização.' : 'Limite permanente em vigor.'}</p>
    <label>Limite permanente de primeiros contactos por dia (1 a 5)<input type="number" min="1" max="5" value={config.maxDaily} onChange={(event) => setConfig({...config,maxDaily:Number(event.target.value)})} /></label>
    <button type="button" className="primary-button" disabled={saving || (!config.enabled && !ready)} onClick={() => void saveConfig({...config,enabled:!config.enabled})}>{saving ? 'A verificar IA...' : config.enabled ? 'Desligar primeiros contactos' : 'Verificar IA e ativar primeiros contactos'}</button>
    {todayOverrideAvailable ? <button type="button" className="secondary-button" disabled={saving || !ready || (effective.overrideActive && config.enabled)} onClick={() => {
      if (!todayOverrideWindow()) { setTodayOverrideAvailable(false); setNotice('A exceção de hoje terminou às 20h de Lisboa.'); return }
      void saveConfig({...config,enabled:true,dateOverride:{date:'2026-10-16',maxDaily:20,minIntervalSeconds:1800}})
    }}>Ativar 20 contactos somente hoje</button> : null}
    <p className="muted">O Mac e o Chrome dedicado precisam de estar ligados e o envio automático também precisa de estar autorizado na configuração local do conector. Ativar no servidor não altera essa autorização local. Horário padrão 09h–20h de Lisboa, com intervalo mínimo de 90 segundos. Falhas ou envios incertos ficam para revisão manual e nunca são reenviados automaticamente. Respostas chegam ao Instagram vinculado. O histórico depende da sincronização pelo conector ou pela Meta. A IA pode preparar a primeira resposta ao cliente no painel da conversa, com convite para obeliscoradical.pt; um rascunho preparado ainda não foi enviado. Até 20 perfis por dia podem ser analisados pela IA, mantendo separado o limite de mensagens.</p>
    {notice ? <p role="status">{notice}</p> : null}
    {jobs.map((job) => <details key={job.id}><summary>@{job.payload.username || 'perfil'} · {statuses[job.status] || job.status}</summary>{job.payload.businessType ? <p>Tipo identificado pela IA: {job.payload.businessType}</p> : null}{job.payload.reason ? <p>{job.payload.reason}</p> : null}{job.payload.message ? <p style={{whiteSpace:'pre-wrap'}}>{job.payload.message}</p> : null}{job.lastError ? <p className="form-error">{job.lastError}</p> : null}</details>)}
  </section>
}
