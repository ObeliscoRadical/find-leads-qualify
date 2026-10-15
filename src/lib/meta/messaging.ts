import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getDb } from '@/db';
import { jobs, leads, messages, metaConnections } from '@/db/schema';
import { decrypt } from '@/lib/encryption';
import { requestsOptOut } from '@/lib/replies/draft';
import { captureGraph } from './lead-capture';
export const messagingScopes = ['instagram_manage_messages', 'pages_manage_metadata'];
export function hasMessagingScopes(scopes: string | null) {
    try { const granted = JSON.parse(scopes || '[]'); return Array.isArray(granted) && messagingScopes.every(scope => granted.includes(scope)); } catch { return false; }
}
export const instagramMessageEventSchema = z.object({
    sender: z.object({id: z.string().regex(/^\d+$/)}), recipient: z.object({id: z.string().regex(/^\d+$/)}), timestamp: z.number().nonnegative(),
    message: z.object({mid: z.string().min(1).max(255), text: z.string().max(10000).optional(), is_echo: z.boolean().optional(), attachments: z.array(z.unknown()).optional()}),
});
export function incomingInstagramEvent(entryId: string, input: unknown) {
    const parsed = instagramMessageEventSchema.safeParse(input);
    if (!parsed.success || parsed.data.message.is_echo || parsed.data.recipient.id !== entryId || parsed.data.sender.id === entryId) return null;
    return parsed.data;
}
// Receive-only: records inbound and honours explicit opt-outs; never sends.
export async function ingestInstagramEvent(entryId: string, input: unknown) {
    const event = incomingInstagramEvent(entryId, input);
    if (!event) return;
    const connections = await getDb().select().from(metaConnections).where(and(eq(metaConnections.igUserId, entryId), eq(metaConnections.status, 'connected')));
    for (const connection of connections) {
        const id = `igi_${createHash('sha256').update(`${connection.organizationId}:${event.message.mid}`).digest('hex')}`;
        await getDb().insert(jobs).values({id,organizationId:connection.organizationId,kind:'instagram_inbound',payload:JSON.stringify(event),status:'pending'}).onConflictDoNothing();
        let username: string | undefined;
        if (hasMessagingScopes(connection.scopes) && connection.pageTokenEncrypted) {
            try {
                const profile = await captureGraph(event.sender.id,decrypt(connection.pageTokenEncrypted),z.object({username:z.string().regex(/^[A-Za-z0-9._]{1,30}$/)}),{fields:'id,username'});
                username = profile.username.toLowerCase();
            } catch { /* Keep the real unmatched event; never infer sender identity. */ }
        }
        await getDb().transaction(async tx => {
            const [pending] = await tx.select().from(jobs).where(and(eq(jobs.id,id),eq(jobs.organizationId,connection.organizationId))).for('update');
            if (!pending || pending.status === 'completed') return;
            let [lead] = await tx.select().from(leads).where(and(eq(leads.organizationId,connection.organizationId),eq(leads.instagramId,event.sender.id))).for('update');
            if (!lead && username) {
                const candidates = await tx.select().from(leads).where(and(eq(leads.organizationId,connection.organizationId),sql`lower(${leads.instagramUsername})=${username}`,sql`(${leads.instagramId} IS NULL OR ${leads.instagramId}=${event.sender.id})`)).for('update');
                if (candidates.length !== 1) return;
                [lead] = candidates;
            }
            if (!lead || !event.message.text) return;
            const [message] = await tx.insert(messages).values({id:`msg_${crypto.randomUUID().replace(/-/g,'')}`,organizationId:connection.organizationId,leadId:lead.id,role:'user',content:event.message.text,sentVia:'api',isFromLead:true,instagramMessageId:event.message.mid,createdAt:new Date(event.timestamp)}).onConflictDoNothing().returning({id:messages.id});
            if (message) await tx.update(leads).set({instagramId:event.sender.id,leadStatus:requestsOptOut(event.message.text) ? 'opted_out' : ['contacted','replied'].includes(lead.leadStatus) ? 'replied' : lead.leadStatus,...(requestsOptOut(event.message.text) ? {noContact:true,noContactReason:'Pedido de não contacto recebido no Instagram'} : {}),lastInteractionAt:new Date(event.timestamp),updatedAt:new Date()}).where(and(eq(leads.id,lead.id),eq(leads.organizationId,connection.organizationId)));
            await tx.update(jobs).set({status:'completed',leadId:lead.id,finishedAt:new Date()}).where(eq(jobs.id,id));
        });
    }
}
