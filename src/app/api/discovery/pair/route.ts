import { requireAuth } from '@/lib/api-auth';
import { jsonError } from '@/lib/api';
import { applyRateLimit, limiters, getClientIdentifier } from '@/lib/rate-limit';
import { pairWorker } from '@/lib/discovery/auth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    const { response } = applyRateLimit(request, limiters.leadsCreate, getClientIdentifier(request));
    if (response)
        return response;
    const auth = await requireAuth(request);
    if (!auth)
        return jsonError('Não autorizado.', 401);
    if (auth.membership?.role !== 'admin')
        return jsonError('Apenas administradores podem conectar o Chrome.', 403);
    return Response.json({ token: pairWorker(auth.session.organizationId, auth.session.userId), expiresInDays: 7 }, { headers: { 'Cache-Control': 'no-store' } });
}
