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
	 * the map's style URLs by `mapOrigins()` in `$lib/map`, the way the
	 * Supabase origin is derived above. MapLibre fetches all four, so they go
	 * in connect-src as well as img-src; its worker is a blob, already admitted.
	 */
	mapOrigins?: readonly string[];
	/**
	 * Where record imagery is served from, beyond Supabase Storage — a
	 * product's `image_url` may name any host at all (a storefront CDN, an
	 * importer's bucket), and `img-src` would block it. Derived from
	 * `PUBLIC_IMAGE_ORIGINS` by `imageOrigins()` below, the way the map's
	 * origins are derived from its style URLs. Images only: never
	 * `connect-src`, and never a wildcard.
	 */
	imageOrigins?: readonly string[];
	/**
	 * Where a voice call's WebSocket goes — derived from the realtime
	 * endpoint by `realtimeOrigins()` in `$lib/ai/realtime`, the way the map's
	 * origins are derived from its style URLs. A call connects to the provider
	 * directly with a short-lived secret this server minted, which is a socket
	 * `connect-src` has to admit; nothing else about the provider is reachable
	 * from the browser.
	 */
	realtimeOrigins?: readonly string[];
}

/**
 * The distinct origins a comma-separated `PUBLIC_IMAGE_ORIGINS` names. Each
 * entry is a URL — `https://cdn.example.com` — and anything unparseable is
 * dropped rather than thrown: a typo in a deployment's env should cost one
 * broken thumbnail, not every response's headers. Unset means no external
 * image host, which is the default and the safe one.
 */
export function imageOrigins(value: string | undefined): string[] {
	const origins = (value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '')
		.map((entry) => URL.parse(entry)?.origin)
		.filter((origin): origin is string => origin !== undefined && origin !== 'null');
	return [...new Set(origins)];
}

export function buildContentSecurityPolicy(
	supabaseUrl: string,
	{
		dev = false,
		mapOrigins = [],
		imageOrigins: images = [],
		realtimeOrigins: realtime = []
	}: SecurityHeaderOptions = {}
): string {
	const supabase = new URL(supabaseUrl).origin;
	// Supabase Realtime connects over a websocket on the same host.
	const supabaseWs = supabase.replace(/^https:/, 'wss:');

	const connectSrc = ["'self'", 'blob:', supabase, supabaseWs, ...mapOrigins, ...realtime];
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
		...mapOrigins,
		...images
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
	// The microphone is the app's own: dictation in the assistant's composer
	// and, on a voice call, the audio the call is made of. Same-origin only —
	// no embedded frame inherits it, and camera and location stay refused.
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
	return response;
}
