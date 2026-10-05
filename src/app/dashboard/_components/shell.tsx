'use client'

import { useRouter } from 'next/navigation'
import BackButton from '../../back-button'
import { BarChart3, Building2, CheckCircle2, LineChart, Search, Settings, Sparkles, Target } from 'lucide-react'

export type NavId = 'overview' | 'discover' | 'qualify' | 'pipeline' | 'companies' | 'metrics' | 'settings'

const nav: Array<{ id: NavId; label: string; icon: React.ComponentType<{ size?: number }>; href: string }> = [
  { id: 'overview', label: 'Visão geral', icon: BarChart3, href: '/dashboard' },
  { id: 'discover', label: 'Descobrir leads', icon: Search, href: '/leads' },
  { id: 'qualify', label: 'Qualificação IA', icon: Sparkles, href: '/qualificacao' },
  { id: 'pipeline', label: 'Pipeline', icon: Target, href: '/kanban' },
  { id: 'companies', label: 'Empresas', icon: Building2, href: '/leads' },
  { id: 'metrics', label: 'Métricas', icon: LineChart, href: '/metricas' },
  { id: 'settings', label: 'Configurações', icon: Settings, href: '/configuracoes' },
]

export function AppShell({
  active,
  userName,
  role,
  aiCredits,
  headerTitle,
  headerSubtitle,
  headerRight,
  children,
}: {
  active: NavId
  userName: string
  role: string
  aiCredits: { used: number; limit: number | null }
  headerTitle: string
  headerSubtitle: string
  headerRight?: React.ReactNode
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <main className="fl-shell">
      <aside className="fl-sidebar">
        <div className="fl-brand">
          <span className="fl-logo"><Search size={19} /><CheckCircle2 size={11} /></span>
          <div><strong>Find Leads <em>Qualify</em></strong><small>AI PROSPECTING</small></div>
        </div>
        <nav>
          <p>OPERAÇÃO</p>
          {nav.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => router.push(item.href)}>
                <Icon size={17} />{item.label}
              </button>
            )
          })}
        </nav>
        <div className="fl-credit">
          <small>Créditos de IA</small>
          <strong>{aiCredits.used.toLocaleString('pt-BR')}</strong>
          <span>tokens usados este mês</span>
          <div><i style={{ width: aiCredits.limit ? `${Math.min(100, (aiCredits.used / aiCredits.limit) * 100)}%` : '0%' }} /></div>
          <button>Sem limite configurado</button>
        </div>
        <div className="fl-user"><span>{userName.slice(0, 2).toUpperCase()}</span><div><strong>{userName}</strong><small>{role}</small></div></div>
      </aside>

      <section className="fl-main">
        <header className="fl-header">
          <div><h1>{headerTitle}</h1><p>{headerSubtitle}</p></div>
          {headerRight}
        </header>
        <div className="fl-content">{active !== 'overview' && <BackButton />}{children}</div>
      </section>
    </main>
  )
}
