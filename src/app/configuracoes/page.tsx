import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth'
import { getLeadDashboardData } from '@/db/queries'
import { AppShell } from '../dashboard/_components/shell'

export default async function ConfiguracoesPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const data = await getLeadDashboardData(session.organizationId, session.userId)
  if (!data) redirect('/login')

  return (
    <AppShell
      active="settings"
      userName={session.name}
      role={session.role}
      aiCredits={data.aiCredits}
      headerTitle="Configurações"
      headerSubtitle="Equipe, integrações e créditos"
    >
      <section className="fl-grid">
        <article className="fl-card">
          <div className="fl-card-head"><div><h2>Organização</h2><p>Dados da conta atual</p></div></div>
          <div className="metric-grid" style={{ padding: '4px 20px 20px' }}>
            <article><span>Organização</span><strong>{data.organizationName}</strong></article>
            <article><span>Utilizador</span><strong>{session.name}</strong></article>
            <article><span>Função</span><strong>{session.role}</strong></article>
          </div>
        </article>

        <article className="fl-card">
          <div className="fl-card-head"><div><h2>Créditos de IA</h2><p>Consumo do mês atual</p></div></div>
          <div style={{ padding: '4px 20px 20px' }}>
            <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{data.aiCredits.used.toLocaleString('pt-BR')}<small style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>tokens usados</small></p>
            <p className="fl-empty" style={{ padding: '10px 0 0' }}>Limite de gasto configurável ainda não está disponível nesta versão.</p>
          </div>
        </article>
      </section>

      <section className="fl-grid">
        <article className="fl-card">
          <div className="fl-card-head"><div><h2>Integrações</h2><p>Ligações com plataformas externas</p></div></div>
          <div className="settings-actions" style={{ padding: '4px 20px 20px' }}>
            <a className="secondary-button" href="/settings/meta">Meta e Instagram</a>
          </div>
        </article>

        <article className="fl-card">
          <div className="fl-card-head"><div><h2>Equipe</h2><p>Convites e permissões</p></div></div>
          <p className="fl-empty">Convidar membros e gerir permissões da equipe ainda não está disponível nesta versão.</p>
        </article>
      </section>
    </AppShell>
  )
}
