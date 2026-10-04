import { NextResponse } from 'next/server'
import { AUTH_COOKIE_NAME } from '@/lib/auth'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.apiDefault, getClientIdentifier(request))
  if (response) return response

  const acceptsHtml = request.headers.get('accept')?.includes('text/html')
  const resp = acceptsHtml
    ? NextResponse.redirect(new URL('/login', request.url), { status: 303 })
    : NextResponse.json({ ok: true })

  resp.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  resp.headers.set('X-RateLimit-Remaining', String(result.remaining))
  return resp
}