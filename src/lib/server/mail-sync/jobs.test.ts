import { describe, expect, it } from 'vitest';
import { supabaseMock } from '$lib/server/crm/test-support';
import { backoffMs, enqueueJob, failJob, MAX_ATTEMPTS, payloadString } from './jobs';

describe('backoffMs', () => {
	it('doubles from a minute and caps at an hour', () => {
		expect(backoffMs(0)).toBe(60_000);
		expect(backoffMs(1)).toBe(60_000);
		expect(backoffMs(2)).toBe(120_000);
		expect(backoffMs(4)).toBe(480_000);
		expect(backoffMs(20)).toBe(3_600_000);
	});
});

describe('payloadString', () => {
	it('reads a string key off an object payload and nothing else', () => {
		expect(payloadString({ pageToken: 'abc' }, 'pageToken')).toBe('abc');
		expect(payloadString({ pageToken: '' }, 'pageToken')).toBeNull();
		expect(payloadString({ pageToken: 3 }, 'pageToken')).toBeNull();
		expect(payloadString('abc', 'pageToken')).toBeNull();
		expect(payloadString(null, 'pageToken')).toBeNull();
		expect(payloadString(['abc'], 'pageToken')).toBeNull();
	});
});

describe('enqueueJob', () => {
	it('treats a pending job of the same kind as success', async () => {
		// SAFETY: the test double only reads `message` and `code` off the error, the two fields a PostgrestError carries that matter here.
		const { supabase } = supabaseMock({
			error: { message: 'duplicate key', code: '23505' } as never
		});
		await expect(
			enqueueJob(supabase, { orgId: 'org', mailboxId: 'mb', kind: 'incremental' })
		).resolves.toBeUndefined();
	});

	it('throws any other refusal', async () => {
		// SAFETY: see above — a message and a code are all the code under test reads.
		const { supabase } = supabaseMock({ error: { message: 'boom', code: '42501' } as never });
		await expect(
			enqueueJob(supabase, { orgId: 'org', mailboxId: 'mb', kind: 'incremental' })
		).rejects.toThrow('boom');
	});
});

describe('failJob', () => {
	it('requeues with the backoff until the attempts run out', async () => {
		const { supabase, builder } = supabaseMock({ data: null });
		const now = new Date('2026-09-14T12:00:00Z');
		await failJob(supabase, { id: 'job', attempts: 2 }, 'nope', { now });
		expect(builder.update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'queued',
				last_error: 'nope',
				next_run_at: new Date(now.getTime() + 120_000).toISOString()
			})
		);
	});

	it('waits as long as Google asked', async () => {
		const { supabase, builder } = supabaseMock({ data: null });
		const now = new Date('2026-09-14T12:00:00Z');
		await failJob(supabase, { id: 'job', attempts: 1 }, 'slow down', { now, retryAfterMs: 5_000 });
		expect(builder.update).toHaveBeenCalledWith(
			expect.objectContaining({ next_run_at: new Date(now.getTime() + 5_000).toISOString() })
		);
	});

	it('gives up after the last attempt', async () => {
		const { supabase, builder } = supabaseMock({ data: null });
		await failJob(supabase, { id: 'job', attempts: MAX_ATTEMPTS }, 'still no');
		expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
	});
});
