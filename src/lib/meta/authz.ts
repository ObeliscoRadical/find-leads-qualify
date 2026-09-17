import { getCurrentSession } from '@/lib/auth'
import { getMembership } from '@/db/queries'

export async function requireCurrentMembership() {
  const session = await getCurrentSession()
  if (!session) return null

  const membership = await getMembership(session.userId, session.organizationId)
  if (!membership) return null

  return {
    session,
    membership,
    organization: membership.organization,
  }
}
