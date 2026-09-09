import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { TermsMap } from '$lib/features/terms';
import type { Vocabulary } from '$lib/features/vocabulary';
import type { PageMeta } from '$lib/features/types';
import type { NavItem } from '$lib/navigation';
import type { NoteDeck } from '$lib/notes';
import type { Preferences } from '$lib/preferences';
import type { OrgMembership } from '$lib/org';
import type { OrgContext } from '$lib/server/org-context';

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
			 * zero rows for an org the user may not act in (not a member, not a
			 * system admin), and the (app) layout load repairs a stale cookie.
			 */
			activeOrgId: string | null;
			/**
			 * The signed-in user's organizations, the active one, its resolved
			 * feature map and the user's grants — loaded once per request by
			 * `hooks.server.ts` (see `$lib/server/org-context`), which also gates
			 * the route on it. Null on public, `/api/*` and `/logout` requests;
			 * the (app) layout re-checks before rendering the shell.
			 */
			org: OrgContext | null;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
			/** From the (app) layout: absent on public routes. */
			organizations?: OrgMembership[];
			activeOrg?: OrgMembership;
			/** The sidebar/palette entries this session may see, from the (app) layout. */
			nav?: NavItem[];
			/**
			 * The open notes and what may be done to them, from the (app) layout —
			 * what the note dock draws on every screen. Null when this session has
			 * no notes feature; absent outside the shell.
			 */
			noteDock?: NoteDeck | null;
			/**
			 * The signed-in user's account preferences, from the (app) layout:
			 * every key resolved, fallbacks folded in — see
			 * docs/user-preferences.md.
			 */
			preferences?: Preferences;
			/** Every page this session may see, with its title, from the (app) layout. */
			pages?: PageMeta[];
			/**
			 * What each feature this session may see is called, as the org's
			 * industry words it, from the (app) layout — see `$lib/features/terms`.
			 */
			terms?: TermsMap;
			/**
			 * The words that are not a feature's name — the roles on a proposal —
			 * as the org's industry says them, from the (app) layout; see
			 * `$lib/features/vocabulary`.
			 */
			vocabulary?: Vocabulary;
			/**
			 * A page title that overrides the `pages` registry, for a title that
			 * depends on a record ("Acme Inc — Clients"). Returned by that page's
			 * load; page data wins over the layout's, so the shell picks it up.
			 * Every other page leaves this unset — see the pages migration.
			 */
			title?: string;
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
