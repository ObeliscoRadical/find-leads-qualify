import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { discoverySchema, profileSchema } from './validation';
vi.mock('@/db/queries', () => ({ getMembership: vi.fn() }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ JWT_SECRET: 'a'.repeat(64) }) }));
import { getMembership } from '@/db/queries';
import { pairWorker, requireWorker } from './auth';
const member = vi.mocked(getMembership);
describe('organization-scoped Chrome pairing', () => {
    beforeEach(() => vi.clearAllMocks());
    it('accepts admin membership in the token organization', async () => {
        member.mockResolvedValue({ role: 'admin' } as Awaited<ReturnType<typeof getMembership>>);
        const token = pairWorker('org_one', 'usr_one');
        const result = await requireWorker(new Request('https://app/api/discovery/worker', { headers: { Authorization: `Bearer ${token}` } }));
        expect(result?.organizationId).toBe('org_one');
        expect(member).toHaveBeenCalledWith('usr_one', 'org_one');
    });
    it('rejects ordinary login tokens and removed admin membership', async () => {
        const normal = jwt.sign({ userId: 'usr_one', organizationId: 'org_one' }, 'a'.repeat(64));
        expect(await requireWorker(new Request('https://app', { headers: { Authorization: `Bearer ${normal}` } }))).toBeNull();
        member.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof getMembership>>);
        expect(await requireWorker(new Request('https://app', { headers: { Authorization: `Bearer ${pairWorker('org_one', 'usr_one')}` } }))).toBeNull();
    });
    it('rejects expired pairing', async () => {
        const token = jwt.sign({ purpose: 'discovery_worker', userId: 'usr_one', organizationId: 'org_one' }, 'a'.repeat(64), { expiresIn: -1 });
        expect(await requireWorker(new Request('https://app', { headers: { Authorization: `Bearer ${token}` } }))).toBeNull();
    });
});
describe('real profile ingestion', () => {
    const base = { username: 'condominios.pt', profileUrl: 'https://www.instagram.com/condominios.pt/', sourceUrl: 'https://www.google.com/search?q=condominios' };
    it('requires profile handle to match its canonical Instagram URL', () => {
        expect(profileSchema.safeParse(base).success).toBe(true);
        expect(profileSchema.safeParse({ ...base, profileUrl: 'https://evil.com/condominios.pt/' }).success).toBe(false);
        expect(profileSchema.safeParse({ ...base, profileUrl: 'https://www.instagram.com/other/' }).success).toBe(false);
        expect(profileSchema.safeParse({ ...base, username: 'explore', profileUrl: 'https://www.instagram.com/explore/' }).success).toBe(false);
    });
    it('caps each real search at 30 results', () => {
        expect(discoverySchema.safeParse({ keywords: 'condominios', limit: 31 }).success).toBe(false);
    });
});
