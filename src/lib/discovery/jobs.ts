import { assessDiscoveryProfile, QUALIFICATION_REVIEW_REASON } from './qualification';
import { and, eq, desc, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { jobs, leads } from '@/db/schema';
import { calculateICPScore } from '@/lib/leads/scoring';
import { z } from 'zod';
import { discoverySchema, resultSchema } from './validation';
import { segmentProfileMatches, OUTSIDE_SEGMENT_REASON } from './segment';
async function recoverExhausted(organizationId: string) {
    await getDb().update(jobs).set({ status: 'failed', finishedAt: new Date(), lastError: 'O Chrome perdeu a conexão após três tentativas. Inicie uma nova busca.' }).where(and(eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery'), eq(jobs.status, 'running'), sql `${jobs.startedAt} < now()-interval '15 minutes'`, sql `COALESCE(${jobs.attempts},0)>=COALESCE(${jobs.maxAttempts},3)`));
}
export async function listDiscovery(organizationId: string) {
    await recoverExhausted(organizationId);
    const rows = await getDb().select().from(jobs).where(and(eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery'))).orderBy(desc(jobs.createdAt)).limit(20);
    return rows.map(row => { const payload = JSON.parse(row.payload || '{}'); delete payload.claimToken; return { ...row, payload }; });
}
export async function createDiscovery(organizationId: string, input: z.infer<typeof discoverySchema>) {
    const id = `job_${crypto.randomUUID().replace(/-/g, '')}`;
    return getDb().transaction(async (tx) => {
        await tx.execute(sql `SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`);
        const active = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery'), sql `${jobs.status} IN ('pending','running')`)).limit(1);
        if (active.length)
            return null;
        await tx.insert(jobs).values({ id, organizationId, kind: 'discovery', payload: JSON.stringify(input), maxAttempts: 3 });
        return id;
    });
}
export async function claimDiscovery(organizationId: string) {
    await recoverExhausted(organizationId);
    const claimToken = crypto.randomUUID();
    // Row lock and update happen in one statement, so concurrent workers cannot claim the same job.
    const rows = await getDb().execute(sql `
    UPDATE jobs SET status='running', started_at=now(), attempts=COALESCE(attempts,0)+1,
      payload=(COALESCE(payload,'{}')::jsonb || jsonb_build_object('claimToken',${claimToken}::text))::text
    WHERE id=(SELECT id FROM jobs WHERE organization_id=${organizationId} AND kind='discovery'
      AND (status='pending' OR (status='running' AND started_at < now()-interval '15 minutes'))
      AND COALESCE(attempts,0)<COALESCE(max_attempts,3) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id,payload`);
    const row = rows[0] as {
        id: string;
        payload: string;
    } | undefined;
    if (!row) return null;
    // Include already known handles (including opted-out / no-contact leads) so
    // the browser spends the search budget on new prospects instead of repeats.
    const known = await getDb().select({ username: leads.instagramUsername }).from(leads)
        .where(eq(leads.organizationId, organizationId)).orderBy(desc(leads.createdAt)).limit(1000);
    const existingUsernames = known.flatMap(lead => lead.username ? [lead.username.toLowerCase()] : []);
    return { id: row.id, ...JSON.parse(row.payload), existingUsernames };
}
export async function finishDiscovery(organizationId: string, input: z.infer<typeof resultSchema>) {
    return getDb().transaction(async (tx) => {
        const [job] = await tx.select().from(jobs).where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery'))).for('update');
        if (!job || job.status !== 'running')
            return null;
        const payload = JSON.parse(job.payload || '{}');
        if (payload.claimToken !== input.claimToken)
            return null;
        const received = input.profiles.slice(0, payload.limit || 10);
        const profiles = received.filter(profile => segmentProfileMatches(profile, payload.keywords || ''));
        const rejected = received.length - profiles.length;
        let inserted = 0;
        for (const profile of profiles) {
            const existing = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.organizationId, organizationId), sql `lower(${leads.instagramUsername})=${profile.username}`)).limit(1);
            if (existing.length)
                continue;
            const assessment = assessDiscoveryProfile(profile.bio || '', payload.keywords || '', payload.location || '');
            const result = await tx.insert(leads).values({ id: `lead_${crypto.randomUUID().replace(/-/g, '')}`, organizationId, sourceType: 'instagram_browser', sourceExternalId: profile.username, instagramUsername: profile.username, instagramDisplayName: profile.displayName || null, instagramBio: profile.bio || null, instagramProfileUrl: `https://www.instagram.com/${profile.username}/`, sourceFields: JSON.stringify({ discoveryJobId: job.id, sourceUrl: profile.sourceUrl, keywords: payload.keywords, location: payload.location, assessment }), icpMatchScore: String(calculateICPScore({ companyNiche: payload.keywords, leadBio: profile.bio })), icpSegment: payload.keywords }).onConflictDoNothing().returning({ id: leads.id });
            inserted += result.length;
        }
        const summary = { inserted, existing: profiles.length - inserted, found: profiles.length, rejected, ingressRejected: rejected };
        const error = input.error || (rejected && !profiles.length ? 'Os resultados encontrados estavam fora do segmento solicitado.' : null);
        delete payload.claimToken;
        await tx.update(jobs).set({ status: error ? 'failed' : 'completed', finishedAt: new Date(), lastError: error, payload: JSON.stringify({ ...payload, ...summary }) }).where(eq(jobs.id, job.id));
        return summary;
    });
}
export async function touchWorker(organizationId: string) {
    await getDb().insert(jobs).values({
        id: `discovery_health_${organizationId}`,
        organizationId,
        kind: 'discovery_worker_health',
        status: 'completed',
        startedAt: new Date(),
    }).onConflictDoUpdate({ target: jobs.id, set: { startedAt: new Date() } });
}
export async function workerHealth(organizationId: string) {
    const [row] = await getDb().select({ lastSeenAt: jobs.startedAt }).from(jobs)
        .where(and(eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery_worker_health'))).limit(1);
    return {
        lastSeenAt: row?.lastSeenAt || null,
        online: Boolean(row?.lastSeenAt && Date.now() - row.lastSeenAt.getTime() < 60000),
    };
}

export async function renewDiscovery(organizationId: string, jobId: string, claimToken: string) {
    const rows = await getDb().update(jobs).set({ startedAt: new Date() })
        .where(and(eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery'), eq(jobs.id, jobId), eq(jobs.status, 'running'), sql`(${jobs.payload}::jsonb->>'claimToken')=${claimToken}`))
        .returning({ id: jobs.id })
    return rows.length > 0
}


export async function reviewDiscovery(organizationId: string, jobId: string) {
    return getDb().transaction(async tx => {
        const [job] = await tx.select().from(jobs)
            .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId), eq(jobs.kind, 'discovery')))
            .for('update')
        if (!job || !['completed', 'failed'].includes(job.status)) return null
        const payload = JSON.parse(job.payload || '{}')
        // Only records actually ingested by this organization and this exact search are reviewed.
        const associated = await tx.select().from(leads).where(and(
            eq(leads.organizationId, organizationId),
            eq(leads.sourceType, 'instagram_browser'),
            sql`(${leads.sourceFields}::jsonb->>'discoveryJobId')=${job.id}`,
        ))
        if (!associated.length) return {valid: payload.found || 0, rejected: payload.rejected || 0, reviewed: 0}
        let valid = 0
        let rejected = 0
        for (const lead of associated) {
            const assessment = assessDiscoveryProfile(lead.instagramBio || '', payload.keywords || '', payload.location || '');
            let sourceFields: Record<string, unknown> = {};
            try {
                const parsedFields = JSON.parse(lead.sourceFields || '{}');
                if (parsedFields && typeof parsedFields === 'object' && !Array.isArray(parsedFields)) sourceFields = parsedFields;
                else if (lead.sourceFields) sourceFields = { legacySourceFields: lead.sourceFields };
            } catch { sourceFields = { legacySourceFields: lead.sourceFields }; }
            await tx.update(leads).set({sourceFields: JSON.stringify({...sourceFields, assessment}), updatedAt: new Date()})
                .where(and(eq(leads.id, lead.id), eq(leads.organizationId, organizationId)));
            // Apply only our own reversible restriction, preserving opt-outs and unrelated restrictions.
            if (lead.leadStatus !== 'opted_out' && lead.noContactReason?.startsWith(QUALIFICATION_REVIEW_REASON)) {
                // User explicitly includes cleaning firms. Remove only this task's generated restriction.
                await tx.update(leads).set({noContact: false, noContactReason: null, updatedAt: new Date()})
                    .where(and(eq(leads.id, lead.id), eq(leads.organizationId, organizationId), sql`${leads.leadStatus} <> 'opted_out'`, sql`${leads.noContactReason} LIKE ${QUALIFICATION_REVIEW_REASON + '%'}`));
            }
            if (segmentProfileMatches({username:lead.instagramUsername || '',displayName:lead.instagramDisplayName,bio:lead.instagramBio}, payload.keywords || '')) {
                valid++
                // Preserve user opt-outs and every unrelated contact restriction.
                if (lead.leadStatus !== 'opted_out' && lead.noContactReason?.startsWith(OUTSIDE_SEGMENT_REASON)) {
                    await tx.update(leads).set({noContact: assessment.buyerFit === 'service_provider', noContactReason: assessment.buyerFit === 'service_provider' ? `${QUALIFICATION_REVIEW_REASON}${assessment.reasons[1]}` : null, updatedAt: new Date()})
                        .where(and(eq(leads.id, lead.id), eq(leads.organizationId, organizationId)))
                }
            } else {
                rejected++
                if (!lead.noContact || lead.noContactReason?.startsWith(OUTSIDE_SEGMENT_REASON)) {
                    await tx.update(leads).set({noContact: true, noContactReason: `${OUTSIDE_SEGMENT_REASON}${payload.keywords}`, updatedAt: new Date()})
                        .where(and(eq(leads.id, lead.id), eq(leads.organizationId, organizationId)))
                }
            }
        }
        const ingressRejected = payload.ingressRejected ?? (payload.reviewedAt ? 0 : payload.rejected || 0)
        const summary = {valid, rejected: ingressRejected + rejected, reviewed: associated.length}
        const noValid = valid === 0 && associated.length > 0 && !(payload.existing || 0)
        await tx.update(jobs).set({
            status: noValid ? 'failed' : job.status,
            lastError: noValid ? 'Resultados fora do segmento solicitado. Refaça a busca com o filtro corrigido.' : job.lastError,
            payload: JSON.stringify({...payload, found: valid + (payload.existing || 0), inserted: valid, ingressRejected, rejected: summary.rejected, reviewedAt: new Date().toISOString()}),
        }).where(and(eq(jobs.id, job.id), eq(jobs.organizationId, organizationId)))
        return summary
    })
}
