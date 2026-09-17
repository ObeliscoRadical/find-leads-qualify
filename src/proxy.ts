import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME, tokenPayloadSchema, type TokenPayload } from '@/lib/auth'

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/api/health',
  '/api/auth/login',
  '/api/auth/register',
]

const PUBLIC_PREFIXES = ['/_next', '/api/webhooks', '/images', '/icons', '/favicon.ico']

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function verifyProxyJwt(token: string): Promise<TokenPayload | null> {
  try {
    const [header, payload, signature] = token.split('.')
    if (!header || !payload || !signature) return null

    const decodedHeader = JSON.parse(new TextDecoder().decode(base64UrlToBytes(header))) as { alg?: string }
    if (decodedHeader.alg !== 'HS256') return null

    const secret = process.env.JWT_SECRET
    if (!secret) return null

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    )
    if (!valid) return null

    const decodedPayload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as TokenPayload & {
      exp?: number
      nbf?: number
    }
    const now = Math.floor(Date.now() / 1000)
    if (decodedPayload.exp && decodedPayload.exp < now) return null
    if (decodedPayload.nbf && decodedPayload.nbf > now) return null

    const parsed = tokenPayloadSchema.safeParse(decodedPayload)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  const isPublicPath = PUBLIC_PATHS.includes(pathname)
  let token = request.cookies.get(AUTH_COOKIE_NAME)?.value

  if (!token) {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) token = authHeader.substring(7).trim()
  }

  const session = token ? await verifyProxyJwt(token) : null

  if (session && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (isPublicPath) return NextResponse.next()

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', session.userId)
  requestHeaders.set('x-organization-id', session.organizationId)
  requestHeaders.set('x-user-role', session.role)
  requestHeaders.set('x-user-email', session.email)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
