import { NextResponse } from 'next/server'
import { createOauthState, deleteExpiredOauthStates } from '@/db/queries'
import { requireAuth } from '@/lib/api-auth'
import { getMetaOAuthUrl } from '@/lib/meta/client'
import { jsonError } from '@/lib/api'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.metaOAuth, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
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

  return NextResponse.redirect(getMetaOAuthUrl(state, new URL(request.url).searchParams.get('capture') === '1'), { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}