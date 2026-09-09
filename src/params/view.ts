/**
 * The `[view=view]` segment of the one view page: a slug shaped like a
 * `views.id` (the views migration). Which slugs EXIST is per-industry data
 * the load resolves against the registry, never a matcher's business — a
 * matcher runs in the browser too and must stay a pure, data-free test — so
 * this only keeps `/views/Settings` and `/views/../x` from reaching a load,
 * and an unregistered slug is the load's 404.
 */
const SLUG = /^[a-z][a-z0-9-]*$/;

export function match(param: string): boolean {
	return SLUG.test(param);
}
