import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			// Typed against the generated schema — run `npm run db:types` after
			// every migration to keep queries fully typed.
			supabase: SupabaseClient<Database>;
			/**
			 * Validates the JWT with the Auth server before returning the session.
			 * Always use this (never `getSession()` alone) for server-side auth
			 * decisions — the raw session cookie is client-controlled input.
			 */
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
			/**
			 * The active-organization cookie's value, when it parses as a UUID.
			 * A convenience for child loads (filter tenant data without an
			 * `await parent()` waterfall) — never an auth decision: RLS returns
			 * zero rows for an org the user is not a member of, and the (app)
			 * layout load repairs a stale cookie.
			 */
			activeOrgId: string | null;
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
