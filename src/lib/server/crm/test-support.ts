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
	'in',
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

function makeBuilder(result: QueryResult): Builder {
	const resolved: Required<QueryResult> = { data: null, error: null, count: null, ...result };
	// A real (already-settled) Promise carrying the chainable methods — the
	// same thenable-builder shape postgrest-js queries have.
	// SAFETY: the loop below puts every BuilderMethod key on the promise
	// before the builder is handed to any test.
	const builder = Promise.resolve(resolved) as Builder;
	for (const method of METHODS) {
		builder[method] = vi.fn(() => builder);
	}
	return builder;
}

export function supabaseMock(result: QueryResult = {}) {
	const builder = makeBuilder(result);
	const from = vi.fn(() => builder);
	// SAFETY: the crm modules only call `.from()` and the chained builder
	// methods stubbed above; the rest of SupabaseClient is never touched.
	const supabase: SupabaseClient<Database> = { from } as never;
	return { supabase, from, builder };
}

/**
 * The same double for code that queries several tables in one call
 * (the org context loader): one builder per table name, each with its own
 * result. A table not listed resolves to an empty result.
 */
export function supabaseTablesMock(results: Record<string, QueryResult>) {
	const builders = Object.fromEntries(
		Object.entries(results).map(([table, result]) => [table, makeBuilder(result)])
	);
	const from = vi.fn((table: string) => builders[table] ?? makeBuilder({}));
	// SAFETY: see supabaseMock.
	const supabase: SupabaseClient<Database> = { from } as never;
	return { supabase, from, builders };
}

export const ORG_ID = '10000000-0000-0000-0000-000000000001';
