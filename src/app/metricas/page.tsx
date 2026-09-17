import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth'
import { getLeadDashboardData } from '@/db/queries'
import { AppShell } from '../dashboard/_components/shell'
import { AreaChart, Kpi } from '../dashboard/_components/charts'

export default async function MetricasPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const data = await getLeadDashboardData(session.organizationId, session.userId)
  if (!data) redirect('/login')

  return (
    <AppShell
      active="metrics"
      userName={session.name}
      role={session.role}
      aiCredits={data.aiCredits}
      headerTitle="Métricas e resultados"
      headerSubtitle="Performance de prospecção"
    >
      <section className="fl-kpis">
        <Kpi label="Leads descobertos" value={data.kpis.discovered.toLocaleString('pt-BR')} unit="este mês" series={data.kpis.discoveredSeries} color="#22D3EE" />
        <Kpi label="Qualificados IA" value={data.kpis.qualified.toLocaleString('pt-BR')} unit={`${data.kpis.discovered ? Math.round(data.kpis.qualified / data.kpis.discovered * 100) : 0}% do total`} series={data.kpis.qualifiedSeries} color="#A855F7" />
        <Kpi label="Taxa de conversão" value={data.kpis.conversion.toLocaleString('pt-BR')} unit="% fechado" series={data.kpis.conversionSeries} color="#3B82F6" />
        <Kpi label="Receita em pipeline" value="Sem dados" unit="não configurada" series={[0, 0, 0, 0, 0, 0, 0, 0, 0]} color="#E879F9" />
      </section>

      <section className="fl-grid">
        <article className="fl-card fl-chart-card">
          <div className="fl-card-head"><div><h2>Descoberta vs. qualificação</h2><p>Últimas 12 semanas com dados reais disponíveis</p></div><div className="fl-legend"><span><i />Descobertos</span><span><i />Qualificados</span></div></div>
          <AreaChart discovered={data.weeklySeries.discovered} qualified={data.weeklySeries.qualified} />
        </article>

        <article className="fl-card fl-pipeline">
          <h2>Pipeline <span>Sem receita</span></h2>
          {data.pipeline.map((item, index) => {
            const maxPipe = Math.max(...data.pipeline.map((p) => p.count), 1)
            return (
              <div key={item.key}>
                <p><span>{item.label}</span><b>{item.count}</b></p>
                <div><i className={`p${index}`} style={{ width: `${(item.count / maxPipe) * 100}%` }} /></div>
              </div>
            )
          })}
        </article>
      </section>

      <section className="fl-grid">
        <article className="fl-card">
          <div className="fl-card-head"><div><h2>Relatório semanal</h2><p>Exportação e agendamento automático</p></div></div>
          <p className="fl-empty">Exportar este relatório em PDF/CSV ou agendar o envio automático por e-mail ainda não está disponível nesta versão. Os números acima já refletem dados reais da organização.</p>
        </article>
      </section>
    </AppShell>
  )
}
