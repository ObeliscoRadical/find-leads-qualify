import { z } from 'zod'
import { jsonError, parseJson } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth'
import { updateOrganizationOnboarding } from '@/db/queries'

export const runtime = 'nodejs'

const onboardingSchema = z.discriminatedUnion('path', [
  z.object({
    path: z.literal('nif'),
    organizationName: z.string().trim().min(2).max(160),
    nif: z.string().trim().regex(/^\d{9}$/),
    cae: z.string().trim().max(10).optional(),
    nicho: z.string().trim().min(2).max(500).optional(),
    description: z.string().trim().max(1200).optional(),
  }),
  z.object({
    path: z.literal('manual'),
    organizationName: z.string().trim().min(2).max(160).optional(),
    nicho: z.string().trim().min(10).max(500),
    description: z.string().trim().min(20).max(1200),
  }),
  z.object({
    path: z.literal('skip'),
  }),
])

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return jsonError('Não autorizado.', 401)

  const parsed = await parseJson(request, onboardingSchema)
  if (parsed.error) return parsed.error

  const payload = parsed.data
  const organization = await updateOrganizationOnboarding({
    organizationId: session.organizationId,
    userId: session.userId,
    name: 'organizationName' in payload ? payload.organizationName : undefined,
    nif: 'nif' in payload ? payload.nif : null,
    cae: 'cae' in payload ? payload.cae || null : null,
    nicho: 'nicho' in payload ? payload.nicho || null : payload.path === 'skip' ? 'A definir' : null,
    description: 'description' in payload ? payload.description || null : null,
  })

  if (!organization) return jsonError('Organização não encontrada.', 404)
  return Response.json({ organization })
}
