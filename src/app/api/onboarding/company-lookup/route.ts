import { z } from 'zod'
import { jsonError } from '@/lib/api'
import { requireAuth } from '@/lib/api-auth'
import {
  CompanyLookupUnavailableError,
  getCompanyLookupProvider,
  isValidPortugueseNif,
} from '@/lib/onboarding/company-provider'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const nifSchema = z.string().trim().regex(/^\d{9}$/, 'NIF deve ter 9 dígitos.')

export async function GET(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.apiDefault, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const { searchParams } = new URL(request.url)
  const parsed = nifSchema.safeParse(searchParams.get('nif') || '')
  if (!parsed.success) return jsonError('NIF inválido.', 422, parsed.error.flatten())
  if (!isValidPortugueseNif(parsed.data)) return jsonError('NIF português inválido.', 422)

  let company
  try {
    company = await getCompanyLookupProvider().lookup(parsed.data)
  } catch (error) {
    if (error instanceof CompanyLookupUnavailableError) {
      return jsonError('Serviço EU VIES temporariamente indisponível. Usa o preenchimento manual ou tenta novamente.', 503)
    }
    throw error
  }
  if (!company) return jsonError('Não encontrámos dados para este NIF.', 404)

  return Response.json({ company }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}