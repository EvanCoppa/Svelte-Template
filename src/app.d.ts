import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			// Once you generate database types (`supabase gen types typescript`),
			// tighten this to `SupabaseClient<Database>` for fully typed queries.
			supabase: SupabaseClient;
			/**
			 * Validates the JWT with the Auth server before returning the session.
			 * Always use this (never `getSession()` alone) for server-side auth
			 * decisions — the raw session cookie is client-controlled input.
			 */
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
		}
		interface Error {
			message: string;
			code?: string;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
