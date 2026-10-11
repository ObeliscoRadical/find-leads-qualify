import { getDiscoverySchedule, saveDiscoverySchedule, scheduleSchema } from '@/lib/discovery/schedule';
import { requireAuth } from '@/lib/api-auth';
import { jsonError, parseJson } from '@/lib/api';
import { createDiscovery, listDiscovery, workerHealth } from '@/lib/discovery/jobs';
import { applyRateLimit, limiters, getClientIdentifier } from '@/lib/rate-limit';
import { discoverySchema } from '@/lib/discovery/validation';
export const runtime = 'nodejs';
export async function GET(request: Request) {
    const auth = await requireAuth(request);
    if (!auth)
        return jsonError('Não autorizado.', 401);
    return Response.json({ jobs: await listDiscovery(auth.session.organizationId), worker: await workerHealth(auth.session.organizationId), schedule: await getDiscoverySchedule(auth.session.organizationId) }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
    const { response } = applyRateLimit(request, limiters.leadsCreate, getClientIdentifier(request));
    if (response)
        return response;
    const auth = await requireAuth(request);
    if (!auth)
        return jsonError('Não autorizado.', 401);
    const parsed = await parseJson(request, discoverySchema);
    if (parsed.error)
        return parsed.error;
    const existing = await listDiscovery(auth.session.organizationId);
    if (existing.some(job => ['pending', 'running'].includes(job.status)))
        return jsonError('Já existe uma busca em andamento.', 409);
    const jobId = await createDiscovery(auth.session.organizationId, parsed.data);
    if (!jobId)
        return jsonError('Já existe uma busca em andamento.', 409);
    return Response.json({ jobId }, { status: 201 });
}

export async function PATCH(request: Request) {
    const auth = await requireAuth(request);
    if (!auth) return jsonError('Não autorizado.', 401);
    if (auth.membership?.role !== 'admin') return jsonError('Apenas administradores podem configurar a busca automática.', 403);
    const parsed = await parseJson(request, scheduleSchema);
    if (parsed.error) return parsed.error;
    return Response.json({ schedule: await saveDiscoverySchedule(auth.session.organizationId, parsed.data) });
}
