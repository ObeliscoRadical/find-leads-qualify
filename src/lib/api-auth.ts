import { getMembership } from '@/db/queries'

export async function requireProxyAuth(request: Request) {
  const userId = request.headers.get('x-user-id')
  const organizationId = request.headers.get('x-organization-id')
  const role = request.headers.get('x-user-role')
  const email = request.headers.get('x-user-email')

  if (!userId || !organizationId || !role || !email) return null

  const membership = await getMembership(userId, organizationId)
  if (!membership || membership.role !== role) return null

  return {
    session: { userId, organizationId, role, email },
    membership,
    organization: membership.organization,
  }
}
