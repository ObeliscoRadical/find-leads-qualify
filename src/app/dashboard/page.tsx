import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth'
import { getLeadDashboardData } from '@/db/queries'
import { FindLeadsDashboard } from './_components/find-leads-dashboard'

export default async function DashboardPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const data = await getLeadDashboardData(session.organizationId, session.userId)
  if (!data) redirect('/login')

  return <FindLeadsDashboard data={{ ...data, userName: session.name, role: session.role }} />
}
