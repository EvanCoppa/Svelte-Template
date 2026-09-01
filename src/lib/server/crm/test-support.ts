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

export function supabaseMock(result: QueryResult = {}) {
	const resolved: Required<QueryResult> = { data: null, error: null, count: null, ...result };
	// SAFETY: the loop below fills in every BuilderMethod key immediately, so
	// the record is complete by the time any test touches it.
	const methods = {} as Record<BuilderMethod, ReturnType<typeof vi.fn>>;
	// A real (already-settled) Promise carrying the chainable methods — the
	// same thenable-builder shape postgrest-js queries have.
	const builder = Object.assign(Promise.resolve(resolved), methods);
	for (const method of METHODS) {
		builder[method] = vi.fn(() => builder);
	}

	const from = vi.fn(() => builder);
	// SAFETY: the crm modules only call `.from()` and the chained builder
	// methods stubbed above; the rest of SupabaseClient is never touched.
	const supabase: SupabaseClient<Database> = { from } as never;
	return { supabase, from, builder };
}

export const ORG_ID = '10000000-0000-0000-0000-000000000001';
