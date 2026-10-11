import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { getMembership } from '@/db/queries';
const workerSchema = z.object({ purpose: z.literal('discovery_worker'), organizationId: z.string().min(1), userId: z.string().min(1), exp: z.number().int().positive() });
export function pairWorker(organizationId: string, userId: string) {
    return jwt.sign({ purpose: 'discovery_worker', organizationId, userId }, getEnv().JWT_SECRET, { expiresIn: '7d' });
}
export async function requireWorker(request: Request) {
    try {
        const header = request.headers.get('authorization') || '';
        if (!header.startsWith('Bearer '))
            return null;
        const token = workerSchema.parse(jwt.verify(header.slice(7), getEnv().JWT_SECRET, { algorithms: ['HS256'] }));
        const membership = await getMembership(token.userId, token.organizationId);
        return membership?.role === 'admin' ? token : null;
    }
    catch {
        return null;
    }
}

export function renewWorkerToken(worker: NonNullable<Awaited<ReturnType<typeof requireWorker>>>, now = Date.now()) {
    const remaining = worker.exp * 1000 - now;
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining >= 24 * 60 * 60 * 1000) return null;
    const renewedToken = pairWorker(worker.organizationId, worker.userId);
    const payload = jwt.decode(renewedToken) as jwt.JwtPayload;
    return { renewedToken, expiresAt: new Date(payload.exp! * 1000).toISOString() };
}
