import { getPrivacyPolicy, savePrivacyPolicy } from '@/db/queries'
import { jsonError } from '@/lib/api'
import { requireProxyAuth } from '@/lib/api-auth'
import { generatePrivacyPolicyPt } from '@/lib/privacy/policy'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const policy = await getPrivacyPolicy(auth.session.organizationId)
  const generatedContent = generatePrivacyPolicyPt(auth.organization)

  return Response.json({
    policy,
    generatedContent,
    organization: {
      id: auth.organization.id,
      name: auth.organization.name,
      nif: auth.organization.nif,
      cae: auth.organization.cae,
      nicho: auth.organization.nicho,
      description: auth.organization.description,
      timezone: auth.organization.timezone,
    },
  })
}

export async function POST(request: Request) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const content = generatePrivacyPolicyPt(auth.organization)
  const policy = await savePrivacyPolicy({
    organizationId: auth.session.organizationId,
    content,
  })

  return Response.json({ policy })
}
