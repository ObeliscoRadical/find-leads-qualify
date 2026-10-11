import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { jobs } from '@/db/schema';
import { discoverySchema } from './validation';

export const scheduleSchema = discoverySchema.extend({
    enabled: z.boolean(),
    intervalMinutes: z.number().int().min(30).max(1440),
});
export type DiscoverySchedule = z.infer<typeof scheduleSchema>;
function parseSchedule(payload: string | null) {
    try { return scheduleSchema.safeParse(JSON.parse(payload || '{}')); }
    catch { return null; }
}
const scheduleId = (organizationId: string) => `discovery_schedule_${organizationId}`;

export async function getDiscoverySchedule(organizationId: string) {
    const [row] = await getDb().select().from(jobs).where(and(eq(jobs.id, scheduleId(organizationId)), eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery_schedule')));
    if (!row) return null;
    const parsed = parseSchedule(row.payload);
    return parsed?.success ? { ...parsed.data, nextRunAt: row.runAt } : null;
}

export async function saveDiscoverySchedule(organizationId: string, input: DiscoverySchedule) {
    return getDb().transaction(async tx => {
        // Share the manual-search lock so updates and both queue producers serialize.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`);
        const runAt = input.enabled ? new Date() : null;
        await tx.insert(jobs).values({ id: scheduleId(organizationId), organizationId, kind: 'discovery_schedule', status: 'completed', payload: JSON.stringify(input), runAt })
            .onConflictDoUpdate({ target: jobs.id, set: { payload: JSON.stringify(input), runAt } });
        return { ...input, nextRunAt: runAt };
    });
}

// Called by authenticated worker polling; works without an open app tab.
export async function enqueueScheduledDiscovery(organizationId: string) {
    return getDb().transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`);
        const [row] = await tx.select().from(jobs).where(and(eq(jobs.id, scheduleId(organizationId)), eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery_schedule'))).for('update');
        if (!row) return null;
        const parsed = parseSchedule(row.payload);
        if (!parsed?.success || !parsed.data.enabled || !row.runAt || row.runAt.getTime() > Date.now()) return null;
        const active = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery'), sql`${jobs.status} IN ('pending','running')`)).limit(1);
        if (active.length) return null;
        const { intervalMinutes, keywords, location, limit } = parsed.data;
        const input = { keywords, location, limit };
        const id = `job_${crypto.randomUUID().replace(/-/g, '')}`;
        await tx.insert(jobs).values({ id, organizationId, kind: 'discovery', payload: JSON.stringify({ ...input, scheduled: true }), maxAttempts: 3 });
        await tx.update(jobs).set({ runAt: new Date(Date.now() + intervalMinutes * 60000) }).where(eq(jobs.id, row.id));
        return id;
    });
}
