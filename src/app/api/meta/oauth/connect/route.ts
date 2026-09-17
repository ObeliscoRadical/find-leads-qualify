import { NextResponse } from 'next/server'
import { createOauthState, deleteExpiredOauthStates } from '@/db/queries'
import { requireCurrentMembership } from '@/lib/meta/authz'
import { getMetaOAuthUrl } from '@/lib/meta/client'
import { jsonError } from '@/lib/api'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireCurrentMembership()
  if (!auth) return jsonError('Não autorizado.', 401)

  await deleteExpiredOauthStates()
  const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  await createOauthState({
    state,
    userId: auth.session.userId,
    organizationId: auth.session.organizationId,
    provider: 'meta',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  })

  return NextResponse.redirect(getMetaOAuthUrl(state))
}
