/**
 * Security headers, applied to every response by `hooks.server.ts`.
 *
 * The CSP is deliberately parameterized on the Supabase URL — never hardcode
 * project refs here. `script-src 'unsafe-inline'` is required by SvelteKit's
 * inline startup script and the theme snippet in `app.html`; if you want a
 * stricter nonce-based policy, move the CSP to `kit.csp` in svelte.config.js
 * (which auto-nonces SvelteKit's scripts) and add `nonce="%sveltekit.nonce%"`
 * to the theme snippet.
 */

export interface SecurityHeaderOptions {
	dev?: boolean;
	/**
	 * Where the map's style, tiles, glyphs and sprite come from — derived from
	 * `PUBLIC_MAP_STYLE_URL` by `mapOrigins()` in `$lib/map`, the way the
	 * Supabase origin is derived above. MapLibre fetches all four, so they go
	 * in connect-src as well as img-src; its worker is a blob, already admitted.
	 */
	mapOrigins?: readonly string[];
}

export function buildContentSecurityPolicy(
	supabaseUrl: string,
	{ dev = false, mapOrigins = [] }: SecurityHeaderOptions = {}
): string {
	const supabase = new URL(supabaseUrl).origin;
	// Supabase Realtime connects over a websocket on the same host.
	const supabaseWs = supabase.replace(/^https:/, 'wss:');

	const connectSrc = ["'self'", 'blob:', supabase, supabaseWs, ...mapOrigins];
	// Vite's dev server and HMR use websockets and dynamic origins.
	if (dev) connectSrc.push('ws:', 'http:', 'https:');
	const imgSrc = [
		"'self'",
		'data:',
		'blob:',
		supabase,
		// github.com + avatars.githubusercontent.com serve the /components
		// avatar demo — remove them along with it.
		'https://github.com',
		'https://avatars.githubusercontent.com',
		...mapOrigins
	];

	return [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		// Svelte transitions and floating-ui positioning write inline styles.
		"style-src 'self' 'unsafe-inline'",
		`img-src ${imgSrc.join(' ')}`,
		"font-src 'self' data:",
		`connect-src ${connectSrc.join(' ')}`,
		`media-src 'self' blob: ${supabase}`,
		"worker-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'"
	].join('; ');
}

export function applySecurityHeaders(
	response: Response,
	supabaseUrl: string,
	options: SecurityHeaderOptions = {}
): Response {
	response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(supabaseUrl, options));
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return response;
}
