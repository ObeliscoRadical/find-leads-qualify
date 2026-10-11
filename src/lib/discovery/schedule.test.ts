import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ schedule: null as null | {id: string; payload: string; runAt: Date | null}, active: false, inserted: [] as unknown[], tail: Promise.resolve() }));
vi.mock('@/db', () => ({ getDb: () => ({
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const previous = state.tail;
        let release!: () => void;
        state.tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        const tx = {
            execute: vi.fn(),
            select: (fields?: unknown) => ({from: () => ({where: () => fields ? {limit: async () => state.active ? [{id: 'active'}] : []} : {for: async () => state.schedule ? [state.schedule] : []}})}),
            insert: () => ({values: async (value: unknown) => {state.inserted.push(value); state.active = true;}}),
            update: () => ({set: (value: {runAt: Date}) => ({where: async () => {if (state.schedule) state.schedule.runAt = value.runAt;}})}),
        };
        try { return await run(tx); } finally { release(); }
    },
}) }));
import { enqueueScheduledDiscovery, scheduleSchema } from './schedule';
const now = new Date('2026-10-11T10:00:00Z');
function configure(enabled = true, runAt: Date | null = now) {
    state.schedule = {id: 'discovery_schedule_org', runAt, payload: JSON.stringify({enabled, keywords: 'condomínios', location: 'Lisboa', limit: 10, intervalMinutes: 60})};
}
describe('autonomous discovery cadence', () => {
    beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(now); state.schedule = null; state.active = false; state.inserted = []; state.tail = Promise.resolve();});
    it('rejects unsafe cadence and malformed configuration', () => {
        expect(scheduleSchema.safeParse({enabled: true, keywords: 'abc', intervalMinutes: 1}).success).toBe(false);
        expect(scheduleSchema.safeParse({enabled: true, keywords: 'abc', intervalMinutes: 60}).success).toBe(true);
    });
    it('does not enqueue absent, paused or future schedules', async () => {
        expect(await enqueueScheduledDiscovery('org')).toBeNull();
        configure(false); expect(await enqueueScheduledDiscovery('org')).toBeNull();
        configure(true, new Date(now.getTime() + 1)); expect(await enqueueScheduledDiscovery('org')).toBeNull();
        expect(state.inserted).toHaveLength(0);
    });
    it('ignores a corrupted saved schedule without breaking polling', async () => {
        configure(); state.schedule!.payload = '{bad json';
        expect(await enqueueScheduledDiscovery('org')).toBeNull();
        expect(state.inserted).toHaveLength(0);
    });
    it('defers due schedules while manual or automatic work is active', async () => {
        configure(); state.active = true;
        expect(await enqueueScheduledDiscovery('org')).toBeNull();
        expect(state.schedule?.runAt).toEqual(now);
        state.active = false;
        expect(await enqueueScheduledDiscovery('org')).toMatch(/^job_/);
        expect(state.schedule?.runAt).toEqual(new Date('2026-10-11T11:00:00Z'));
    });
    it('serializes concurrent pollers and does not replay missed intervals', async () => {
        configure(true, new Date('2026-10-10T10:00:00Z'));
        const result = await Promise.all([enqueueScheduledDiscovery('org'), enqueueScheduledDiscovery('org')]);
        expect(result.filter(Boolean)).toHaveLength(1);
        expect(state.inserted).toHaveLength(1);
        expect(state.schedule?.runAt).toEqual(new Date('2026-10-11T11:00:00Z'));
        state.active = false;
        expect(await enqueueScheduledDiscovery('org')).toBeNull();
        vi.setSystemTime(new Date('2026-10-11T11:00:00Z'));
        expect(await enqueueScheduledDiscovery('org')).toMatch(/^job_/);
        expect(state.inserted).toHaveLength(2);
    });
});
