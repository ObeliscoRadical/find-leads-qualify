import { NextResponse } from 'next/server'
import { AUTH_COOKIE_NAME } from '@/lib/auth'

export async function POST(request: Request) {
  const acceptsHtml = request.headers.get('accept')?.includes('text/html')
  const response = acceptsHtml
    ? NextResponse.redirect(new URL('/login', request.url), { status: 303 })
    : NextResponse.json({ ok: true })

  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
