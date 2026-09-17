'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Filter, Mail, MessageCircle, Plus, LineChart, Search, Sparkles, X, Zap } from 'lucide-react'
import type { LeadDashboardData, LeadDashboardLead } from '@/db/queries'
import { AppShell } from './shell'
import { AreaChart, Kpi, ScoreRing, scoreColor } from './charts'

type Tab = 'Todos' | 'Quentes' | 'Novos' | 'Score 80+'
type StatusFilter = 'Todos' | LeadDashboardLead['status']

const statusClass: Record<LeadDashboardLead['status'], string> = {
  Quente: 'hot',
  Morno: 'warm',
  Nutrir: 'nurture',
  Frio: 'cold',
}

const statusFilters: StatusFilter[] = ['Todos', 'Quente', 'Morno', 'Nutrir', 'Frio']
const scoreFilters = [0, 60, 75, 85] as const

export function FindLeadsDashboard({ data }: { data: LeadDashboardData }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Todos')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos')
  const [minScore, setMinScore] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const filtersRef = useRef<HTMLDivElement>(null)
  const selected = data.leads.find((lead) => lead.id === selectedId) || null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedId(null); setFiltersOpen(false) }
    }
    const onClick = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) setFiltersOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return data.leads.filter((lead) => {
      const tabMatch = tab === 'Todos' || (tab === 'Quentes' && lead.status === 'Quente') || (tab === 'Novos' && lead.isNew) || (tab === 'Score 80+' && lead.score >= 80)
      const queryMatch = !q || `${lead.company} ${lead.contact} ${lead.meta}`.toLowerCase().includes(q)
      const statusMatch = statusFilter === 'Todos' || lead.status === statusFilter
      const scoreMatch = lead.score >= minScore
      return tabMatch && queryMatch && statusMatch && scoreMatch
    })
  }, [data.leads, query, tab, statusFilter, minScore])

  const activeFilterCount = (statusFilter !== 'Todos' ? 1 : 0) + (minScore > 0 ? 1 : 0)
  const topLead = data.leads[0]
  const maxPipe = Math.max(...data.pipeline.map((item) => item.count), 1)

  const notAvailable = (label: string) => setToast(`${label}: ainda não disponível nesta versão.`)

  return (
    <AppShell
      active="overview"
      userName={data.userName}
      role={data.role}
      aiCredits={data.aiCredits}
      headerTitle="Visão geral dos leads"
      headerSubtitle="Painel de prospecção com dados reais da organização"
      headerRight={
        <>
          <label className="fl-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa, setor ou contato..." /><kbd>⌘K</kbd></label>
          <div ref={filtersRef} style={{ position: 'relative' }}>
            <button className="fl-secondary" onClick={() => setFiltersOpen((open) => !open)}>
              <Filter size={16} />Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </button>
            {filtersOpen ? (
              <div
                style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 10, width: 260,
                  border: '1px solid rgba(120, 160, 255, 0.14)', borderRadius: 16, background: 'var(--surface)',
                  boxShadow: 'var(--shadow-high)', padding: 16,
                }}
              >
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--muted-deep)', textTransform: 'uppercase' }}>Status</p>
                <div className="fl-tabs" style={{ marginBottom: 14 }}>
                  {statusFilters.map((status) => (
                    <button key={status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{status}</button>
                  ))}
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--muted-deep)', textTransform: 'uppercase' }}>Score mínimo</p>
                <div className="fl-tabs">
                  {scoreFilters.map((score) => (
                    <button key={score} className={minScore === score ? 'active' : ''} onClick={() => setMinScore(score)}>{score === 0 ? 'Todos' : `${score}+`}</button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button className="fl-primary" onClick={() => { setTab('Score 80+'); if (topLead) setSelectedId(topLead.id) }}><Zap size={16} />Qualificar com IA</button>
        </>
      }
    >
      <section className="fl-kpis">
        <Kpi label="Leads descobertos" value={data.kpis.discovered.toLocaleString('pt-BR')} unit="este mês" series={data.kpis.discoveredSeries} color="#22D3EE" />
        <Kpi label="Qualificados IA" value={data.kpis.qualified.toLocaleString('pt-BR')} unit={`${data.kpis.discovered ? Math.round(data.kpis.qualified / data.kpis.discovered * 100) : 0}% do total`} series={data.kpis.qualifiedSeries} color="#A855F7" />
        <Kpi label="Taxa de conversão" value={data.kpis.conversion.toLocaleString('pt-BR')} unit="% fechado" series={data.kpis.conversionSeries} color="#3B82F6" />
        <Kpi label="Receita em pipeline" value="Sem dados" unit="não configurada" series={[0, 0, 0, 0, 0, 0, 0, 0, 0]} color="#E879F9" />
      </section>

      <section className="fl-grid">
        <article className="fl-card fl-table-card">
          <div className="fl-card-head"><div><h2>Leads qualificados pela IA</h2><p>Ordenado por score preditivo</p></div><div className="fl-tabs">{(['Todos', 'Quentes', 'Novos', 'Score 80+'] as Tab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div></div>
          <div className="fl-lead-head"><span /><span>Empresa & contato</span><span>Score</span><span>Status</span></div>
          <div className="fl-leads">{filtered.length ? filtered.map((lead, index) => <button key={lead.id} className={`fl-lead ${selectedId === lead.id ? 'selected' : ''}`} onClick={() => setSelectedId(lead.id)}><span className={`fl-avatar g${index % 4}`}>{lead.initials}</span><span className="fl-lead-copy"><strong>{lead.company}{lead.isNew ? <em>NOVO</em> : null}</strong><small>{lead.contact} · {lead.role} · {lead.meta}</small></span><ScoreRing score={lead.score} /><span className={`fl-status ${statusClass[lead.status]}`}><i />{lead.status}</span></button>) : <p className="fl-empty">Sem leads reais para os filtros atuais.</p>}</div>
          <footer>Mostrando {filtered.length} de {data.totalLeads} leads no segmento ativo <a href="/leads">Abrir lista completa <ChevronRight size={12} /></a></footer>
        </article>

        <aside className="fl-side-stack">
          <article className="fl-engine"><span className="scan" /><h2><i />Motor de qualificação {data.qualification.active ? 'ativo' : 'sem job ativo'}</h2><p>{data.qualification.active ? `Analisando ${data.qualification.pendingCompanies} tarefa(s) de IA pendente(s) contra o ICP configurado.` : 'Nenhum job de qualificação em execução neste momento.'}</p><div><span>lote {data.qualification.currentBatch} de {data.qualification.totalBatches}</span><span>{data.qualification.progress}%</span></div><progress value={data.qualification.progress} max="100" /></article>
          <article className="fl-card fl-pipeline"><h2>Pipeline <span>Sem receita</span></h2>{data.pipeline.map((item, index) => <div key={item.key}><p><span>{item.label}</span><b>{item.count}</b></p><div><i className={`p${index}`} style={{ width: `${item.count / maxPipe * 100}%` }} /></div></div>)}</article>
          <article className="fl-card fl-actions">
            <h2>Ações rápidas</h2>
            <div>
              <button onClick={() => notAvailable('Sequência de e-mail')}><Mail size={17} />Sequência de e-mail</button>
              <button onClick={() => router.push('/leads')}><Plus size={17} />Nova busca de ICP</button>
              <button onClick={() => router.push('/metricas')}><LineChart size={17} />Relatório semanal</button>
              <button onClick={() => notAvailable('Enriquecer contatos')}><MessageCircle size={17} />Enriquecer contatos</button>
            </div>
          </article>
        </aside>
      </section>

      <section className="fl-grid">
        <article className="fl-card fl-chart-card"><div className="fl-card-head"><div><h2>Descoberta vs. qualificação</h2><p>Últimas 12 semanas com dados reais disponíveis</p></div><div className="fl-legend"><span><i />Descobertos</span><span><i />Qualificados</span></div></div><AreaChart discovered={data.weeklySeries.discovered} qualified={data.weeklySeries.qualified} /></article>
        <article className="fl-card fl-timeline"><h2>Histórico de interações <span>{selected?.company || topLead?.company || 'Sem lead selecionado'}</span></h2>{(selected || topLead) ? (data.timelineByLeadId[(selected || topLead)!.id] || []).map((event) => <div key={`${event.title}-${event.when}`}><i style={{ color: event.color }} /><section><strong>{event.title}</strong><time>{event.when}</time><p>{event.body}</p></section></div>) : <p className="fl-empty">Selecione um lead para ver interações reais.</p>}{(selected || topLead) && !(data.timelineByLeadId[(selected || topLead)!.id] || []).length ? <p className="fl-empty">Sem interações reais registradas para este lead.</p> : null}</article>
      </section>

      {selected ? <LeadDrawer lead={selected} onClose={() => setSelectedId(null)} timeline={data.timelineByLeadId[selected.id] || []} /> : null}
      {toast ? <div className="fl-toast">{toast}</div> : null}
    </AppShell>
  )
}

function LeadDrawer({ lead, onClose, timeline }: { lead: LeadDashboardLead; onClose: () => void; timeline: LeadDashboardData['timelineByLeadId'][string] }) {
  return <div className="fl-overlay" onClick={onClose}><aside className="fl-drawer" onClick={(event) => event.stopPropagation()}><header><span className="fl-avatar g1">{lead.initials}</span><div><h2>{lead.company}</h2><p>{lead.meta}</p></div><button onClick={onClose} aria-label="Fechar"><X size={18} /></button></header><div className="fl-drawer-stats"><article><span>SCORE IA</span><strong style={{ color: scoreColor(lead.score) }}>{lead.score}</strong></article><article><span>FIT COM ICP</span><strong>{lead.fit}</strong></article></div><section className="fl-ai"><h3><Sparkles size={15} />Resumo da IA</h3><p>{lead.summary}</p></section><section><h3>Sinais detectados</h3><div className="fl-chips">{lead.signals.length ? lead.signals.map((signal) => <span key={signal}>{signal}</span>) : <p className="fl-empty">Sem sinais detectados.</p>}</div></section><section className="fl-contact"><h3>Contato principal</h3><dl><dt>Nome</dt><dd>{lead.contact}</dd><dt>Cargo</dt><dd>{lead.role}</dd><dt>E-mail</dt><dd>{lead.email}</dd><dt>Telefone</dt><dd>{lead.phone}</dd></dl></section><div className="fl-drawer-actions"><button className="fl-primary">Iniciar contato</button><button className="fl-secondary">Mover no pipeline</button></div>{timeline.length ? <section><h3>Últimas interações</h3>{timeline.map((event) => <p className="fl-drawer-event" key={`${event.title}-${event.when}`}><strong>{event.title}</strong><span>{event.when}</span></p>)}</section> : null}</aside></div>
}
