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
