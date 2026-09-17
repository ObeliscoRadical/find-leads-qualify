import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth'
import { getLeadDashboardData } from '@/db/queries'
import { AppShell } from '../dashboard/_components/shell'

export default async function QualificacaoPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const data = await getLeadDashboardData(session.organizationId, session.userId)
  if (!data) redirect('/login')

  const buckets = [
    { label: 'Score 85+', count: data.leads.filter((lead) => lead.score >= 85).length },
    { label: 'Score 75-84', count: data.leads.filter((lead) => lead.score >= 75 && lead.score < 85).length },
    { label: 'Score 60-74', count: data.leads.filter((lead) => lead.score >= 60 && lead.score < 75).length },
    { label: 'Score < 60', count: data.leads.filter((lead) => lead.score < 60).length },
  ]
  const maxBucket = Math.max(...buckets.map((bucket) => bucket.count), 1)

  return (
    <AppShell
      active="qualify"
      userName={session.name}
      role={session.role}
      aiCredits={data.aiCredits}
      headerTitle="Qualificação por IA"
      headerSubtitle="Modelos de scoring e regras de ICP"
    >
      <section className="fl-grid">
        <article className="fl-engine">
          <span className="scan" />
          <h2><i />Motor de qualificação {data.qualification.active ? 'ativo' : 'sem job ativo'}</h2>
          <p>{data.qualification.active ? `Analisando ${data.qualification.pendingCompanies} tarefa(s) de IA pendente(s) contra o ICP configurado.` : 'Nenhum job de qualificação em execução neste momento.'}</p>
          <div><span>lote {data.qualification.currentBatch} de {data.qualification.totalBatches}</span><span>{data.qualification.progress}%</span></div>
          <progress value={data.qualification.progress} max="100" />
        </article>

        <article className="fl-card">
          <div className="fl-card-head"><div><h2>Distribuição de score</h2><p>Leads reais da organização, agrupados por faixa de score preditivo</p></div></div>
          <div style={{ display: 'grid', gap: 12, padding: '4px 20px 20px' }}>
            {data.leads.length ? buckets.map((bucket) => (
              <div key={bucket.label}>
                <p style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 6px', fontSize: '0.8rem' }}><span>{bucket.label}</span><b>{bucket.count}</b></p>
                <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(bucket.count / maxBucket) * 100}%`, background: 'linear-gradient(90deg, #22d3ee, #a855f7)' }} />
                </div>
              </div>
            )) : <p className="fl-empty">Sem leads reais para calcular a distribuição de score.</p>}
          </div>
        </article>
      </section>

      <section className="fl-grid">
        <article className="fl-card">
          <div className="fl-card-head"><div><h2>Regras de ICP</h2><p>Critérios usados pelo motor de qualificação</p></div></div>
          <p className="fl-empty">A configuração de regras de ICP personalizadas ainda não está disponível nesta versão. O score exibido acima vem do modelo de qualificação padrão já usado no restante do produto.</p>
        </article>
      </section>
    </AppShell>
  )
}
