import { requireWorker } from '@/lib/discovery/auth';
import { jsonError, parseJson } from '@/lib/api';
import { claimDiscovery, finishDiscovery, touchWorker, renewDiscovery } from '@/lib/discovery/jobs';
import { z } from 'zod';
import { resultSchema } from '@/lib/discovery/validation';
export const runtime = 'nodejs';
export async function GET(request: Request) {
    const worker = await requireWorker(request);
    if (!worker)
        return jsonError('Conexão do Chrome inválida ou expirada.', 401);
    await touchWorker(worker.organizationId);
    return Response.json({ job: await claimDiscovery(worker.organizationId) }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
    const worker = await requireWorker(request);
    if (!worker)
        return jsonError('Conexão do Chrome inválida ou expirada.', 401);
    const parsed = await parseJson(request, resultSchema);
    if (parsed.error)
        return parsed.error;
    const result = await finishDiscovery(worker.organizationId, parsed.data);
    return result ? Response.json(result) : jsonError('Esta busca não pertence a esta conexão ou já expirou.', 409);
}

export async function PATCH(request: Request) {
    const worker = await requireWorker(request)
    if (!worker) return jsonError('Conexão do Chrome inválida ou expirada.', 401)
    const parsed = await parseJson(request, z.object({jobId: z.string().min(1).max(100), claimToken: z.string().uuid()}))
    if (parsed.error) return parsed.error
    const renewed = await renewDiscovery(worker.organizationId, parsed.data.jobId, parsed.data.claimToken)
    if (!renewed) return jsonError('A busca já expirou.', 409)
    await touchWorker(worker.organizationId)
    return Response.json({renewed: true})
}
