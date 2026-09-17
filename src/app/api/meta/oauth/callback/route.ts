import { NextResponse } from 'next/server'
import { consumeOauthState, getMembership, upsertMetaConnection } from '@/db/queries'
import { getCurrentSession } from '@/lib/auth'
import { encrypt } from '@/lib/encryption'
import { exchangeCodeForLongLivedToken, listEligibleInstagramPages, MetaProviderError } from '@/lib/meta/client'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') || ''
  const code = url.searchParams.get('code') || ''
  const denied = url.searchParams.get('error') || url.searchParams.get('error_reason')

  if (denied) return redirectWithStatus(request.url, 'denied')
  if (!state || !code) return redirectWithStatus(request.url, 'invalid')

  const session = await getCurrentSession()
  if (!session) return redirectWithStatus(request.url, 'unauthorized')

  const oauthState = await consumeOauthState(state, 'meta')
  if (!oauthState) return redirectWithStatus(request.url, 'expired')
  if (oauthState.userId !== session.userId || oauthState.organizationId !== session.organizationId) {
    return redirectWithStatus(request.url, 'unauthorized')
  }

  const membership = await getMembership(session.userId, session.organizationId)
  if (!membership) return redirectWithStatus(request.url, 'unauthorized')

  try {
    const token = await exchangeCodeForLongLivedToken(code)
    const pages = await listEligibleInstagramPages(token.accessToken)
    if (pages.length === 0) return redirectWithStatus(request.url, 'no_pages')

    const selected = pages.length === 1 ? pages[0] : null
    await upsertMetaConnection({
      organizationId: session.organizationId,
      accessTokenEncrypted: encrypt(token.accessToken),
      pageTokenEncrypted: selected ? encrypt(selected.pageAccessToken) : null,
      pageId: selected?.pageId || null,
      pageName: selected?.pageName || null,
      igUserId: selected?.igUserId || null,
      igUsername: selected?.igUsername || null,
      scopes: JSON.stringify(token.scopes),
      expiresAt: token.expiresAt,
      status: selected ? 'connected' : 'pending_selection',
    })

    return redirectWithStatus(request.url, selected ? 'connected' : 'select_page')
  } catch (error) {
    if (error instanceof MetaProviderError) {
      return redirectWithStatus(request.url, 'provider_error')
    }
    throw error
  }
}

function redirectWithStatus(requestUrl: string, status: string) {
  const redirectUrl = new URL('/settings/meta', requestUrl)
  redirectUrl.searchParams.set('meta', status)
  return NextResponse.redirect(redirectUrl)
}
