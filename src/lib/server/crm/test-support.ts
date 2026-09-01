import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';

/**
 * Test double for the Supabase query builder, shared by the crm module
 * tests. Every builder method chains (returns itself) and the builder is
 * awaitable, resolving to the configured result — mirroring how
 * postgrest-js builders behave. Assertions read the recorded calls.
 */

const METHODS = [
	'select',
	'insert',
	'upsert',
	'update',
	'delete',
	'eq',
	'is',
	'order',
	'limit',
	'single',
	'maybeSingle'
] as const;

type BuilderMethod = (typeof METHODS)[number];

export type QueryResult = {
	data?: unknown;
	error?: { message: string } | null;
	count?: number | null;
};

type Builder = Promise<Required<QueryResult>> & Record<BuilderMethod, ReturnType<typeof vi.fn>>;

export function supabaseMock(result: QueryResult = {}) {
	const resolved: Required<QueryResult> = { data: null, error: null, count: null, ...result };
	// A real (already-settled) Promise carrying the chainable methods — the
	// same thenable-builder shape postgrest-js queries have.
	// SAFETY: the loop below puts every BuilderMethod key on the promise
	// before the builder is handed to any test.
	const builder = Promise.resolve(resolved) as Builder;
	for (const method of METHODS) {
		builder[method] = vi.fn(() => builder);
	}

	const from = vi.fn(() => builder);
	// SAFETY: the crm modules only call `.from()` and the chained builder
	// methods stubbed above; the rest of SupabaseClient is never touched.
	const supabase: SupabaseClient<Database> = { from } as never;
	return { supabase, from, builder };
}

/**
 * Like `supabaseMock`, but for a function running SEVERAL queries in
 * sequence (a lookup then a write, say). Each `.from()` starts a new query,
 * so the nth call gets the nth result — the last one repeats if a function
 * queries more times than the test supplied. The chainable methods are
 * shared across the sequence, so assertions read exactly as they do with
 * `supabaseMock`.
 */
export function supabaseMockSequence(results: QueryResult[]) {
	const queue = results.map((result): Required<QueryResult> => ({
		data: null,
		error: null,
		count: null,
		...result
	}));
	let issued = 0;
	let current: Builder;

	// Every method returns whichever builder `.from()` handed out last, which
	// is the one the chain under test is building on.
	const methods = Object.fromEntries(METHODS.map((name) => [name, vi.fn(() => current)]));

	const from = vi.fn(() => {
		// SAFETY: the loop below puts every BuilderMethod key on the promise
		// before it is returned to the caller.
		const builder = Promise.resolve(queue[Math.min(issued++, queue.length - 1)]) as Builder;
		for (const method of METHODS) {
			builder[method] = methods[method];
		}
		current = builder;
		return builder;
	});

	// SAFETY: same as supabaseMock — only `.from()` and the stubbed builder
	// methods are ever reached.
	const supabase: SupabaseClient<Database> = { from } as never;
	return { supabase, from, builder: methods };
}

export const ORG_ID = '10000000-0000-0000-0000-000000000001';
