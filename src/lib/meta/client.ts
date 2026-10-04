import { z } from 'zod'
import { getMetaEnv } from '@/lib/env'

const graphErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      type: z.string().optional(),
      code: z.number().optional(),
      error_subcode: z.number().optional(),
    })
    .optional(),
})

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
})

const debugTokenSchema = z.object({
  data: z.object({
    app_id: z.string(),
    type: z.string().optional(),
    application: z.string().optional(),
    expires_at: z.number().optional(),
    is_valid: z.boolean(),
    scopes: z.array(z.string()).optional(),
    user_id: z.string().optional(),
  }),
})

const pagesResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      access_token: z.string(),
      instagram_business_account: z
        .object({
          id: z.string(),
          username: z.string().optional(),
        })
        .optional(),
      connected_instagram_account: z
        .object({
          id: z.string(),
          username: z.string().optional(),
        })
        .optional(),
    })
  ),
})

export type MetaEligiblePage = {
  pageId: string
  pageName: string
  pageAccessToken: string
  igUserId: string
  igUsername: string | null
}

export type MetaTokenInfo = {
  accessToken: string
  expiresAt: Date | null
  scopes: string[]
}

export class MetaProviderError extends Error {
  constructor(
    message: string,
    public readonly status = 502
  ) {
    super(message)
  }
}

export function getMetaOAuthUrl(state: string) {
  const env = getMetaEnv()
  const url = new URL(`https://www.facebook.com/${env.META_API_VERSION}/dialog/oauth`)
  url.searchParams.set('client_id', env.META_APP_ID)
  url.searchParams.set('redirect_uri', env.META_REDIRECT_URI)
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', getMetaScopes().join(','))
  return url
}

// Render's internal request origin can be localhost; always return to the configured public origin.
export function getMetaSettingsUrl(status: string) {
  const url = new URL('/settings/meta', getMetaEnv().META_REDIRECT_URI)
  url.searchParams.set('meta', status)
  return url
}

export function getMetaScopes() {
  return ['pages_show_list', 'instagram_basic', 'business_management', 'pages_read_engagement']
}

export async function exchangeCodeForLongLivedToken(code: string): Promise<MetaTokenInfo> {
  const env = getMetaEnv()
  const shortTokenUrl = graphUrl('/oauth/access_token')
  shortTokenUrl.searchParams.set('client_id', env.META_APP_ID)
  shortTokenUrl.searchParams.set('client_secret', env.META_APP_SECRET)
  shortTokenUrl.searchParams.set('redirect_uri', env.META_REDIRECT_URI)
  shortTokenUrl.searchParams.set('code', code)

  const shortToken = await fetchGraph(shortTokenUrl, tokenResponseSchema)

  const longTokenUrl = graphUrl('/oauth/access_token')
  longTokenUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longTokenUrl.searchParams.set('client_id', env.META_APP_ID)
  longTokenUrl.searchParams.set('client_secret', env.META_APP_SECRET)
  longTokenUrl.searchParams.set('fb_exchange_token', shortToken.access_token)

  const longToken = await fetchGraph(longTokenUrl, tokenResponseSchema)
  const debug = await debugToken(longToken.access_token)
  if (!debug.data.is_valid || debug.data.app_id !== env.META_APP_ID) {
    throw new MetaProviderError('Token Meta inválido.')
  }

  return {
    accessToken: longToken.access_token,
    expiresAt: debug.data.expires_at ? new Date(debug.data.expires_at * 1000) : null,
    scopes: debug.data.scopes || [],
  }
}

export async function listEligibleInstagramPages(userAccessToken: string): Promise<MetaEligiblePage[]> {
  const url = graphUrl('/me/accounts')
  url.searchParams.set('access_token', userAccessToken)
  url.searchParams.set(
    'fields',
    'id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}'
  )
  url.searchParams.set('limit', '100')

  const pages = await fetchGraph(url, pagesResponseSchema)
  console.info('Meta page discovery', { pages: pages.data.length, linkedInstagram: pages.data.filter(page => page.instagram_business_account || page.connected_instagram_account).length })
  return pages.data.flatMap((page) => {
    const instagram = page.instagram_business_account || page.connected_instagram_account
    if (!instagram?.id) return []
    return [
      {
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        igUserId: instagram.id,
        igUsername: instagram.username || null,
      },
    ]
  })
}

async function debugToken(inputToken: string) {
  const env = getMetaEnv()
  const url = graphUrl('/debug_token')
  url.searchParams.set('input_token', inputToken)
  url.searchParams.set('access_token', `${env.META_APP_ID}|${env.META_APP_SECRET}`)
  return fetchGraph(url, debugTokenSchema)
}

function graphUrl(path: string) {
  return new URL(`https://graph.facebook.com/${getMetaEnv().META_API_VERSION}${path}`)
}

async function fetchGraph<T>(url: URL, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const parsed = graphErrorSchema.safeParse(body)
    const code = parsed.success ? parsed.data.error?.code : undefined
    throw new MetaProviderError(code ? `Erro Meta (${code}).` : 'Erro ao comunicar com a Meta.')
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new MetaProviderError('Resposta inesperada da Meta.')
  return parsed.data
}
