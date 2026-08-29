import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES_DIR = fileURLToPath(new URL('../../src/routes', import.meta.url));

/**
 * Mirrors `PUBLIC_PATHS` in `src/hooks.server.ts`. It is a deliberate copy:
 * that module imports SvelteKit's `$env` modules, which do not resolve in
 * Playwright's plain-Node runner. The duplication cannot drift silently —
 * `e2e/guest/auth-guard.spec.ts` expects every route outside this list to
 * bounce to /login, so widening `PUBLIC_PATHS` without widening this turns
 * that spec red.
 */
const PUBLIC_PREFIXES = ['/login', '/auth'];

/**
 * Reachable only by a browser that just verified a password-recovery link, so
 * neither sweep can render it: signed out and signed in alike land back on
 * /login. `src/routes/reset-password/page.server.test.ts` covers the flow
 * itself.
 */
const RECOVERY_ONLY = ['/reset-password'];

function collect(dir: string, pathname: string, found: string[]): void {
	const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
		a.name.localeCompare(b.name)
	);

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			// Endpoints (`+server.ts`) render nothing to sweep.
			if (entry.name === '+page.svelte') found.push(pathname === '' ? '/' : pathname);
			continue;
		}
		// A route group — `(app)` — organises files without adding a URL segment.
		if (entry.name.startsWith('(')) {
			collect(join(dir, entry.name), pathname, found);
			continue;
		}
		// Parameterised segments need fixture data a blind sweep cannot invent.
		// Give those pages a spec of their own.
		if (entry.name.startsWith('[')) continue;
		collect(join(dir, entry.name), `${pathname}/${entry.name}`, found);
	}
}

/**
 * Every pathname under `src/routes` that renders a page.
 *
 * Reading the filesystem rather than a hand-kept list is what makes the sweep
 * automatic: a new page under `(app)` is covered by both tiers the moment it
 * exists, with nothing to remember to add here.
 */
export function allRoutes(): string[] {
	const found: string[] = [];
	collect(ROUTES_DIR, '', found);
	return found.sort();
}

export function isPublicRoute(pathname: string): boolean {
	return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** The pages the auth guard protects — the sweep's subject, in both tiers. */
export function guardedRoutes(): string[] {
	return allRoutes().filter(
		(pathname) => !isPublicRoute(pathname) && !RECOVERY_ONLY.includes(pathname)
	);
}

/** The pages an anonymous visitor is allowed to render. */
export function publicRoutes(): string[] {
	return allRoutes().filter(isPublicRoute);
}
