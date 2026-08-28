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

export function buildContentSecurityPolicy(supabaseUrl: string, { dev = false } = {}): string {
	const supabase = new URL(supabaseUrl).origin;
	// Supabase Realtime connects over a websocket on the same host.
	const supabaseWs = supabase.replace(/^https:/, 'wss:');

	const connectSrc = ["'self'", 'blob:', supabase, supabaseWs];
	// Vite's dev server and HMR use websockets and dynamic origins.
	if (dev) connectSrc.push('ws:', 'http:', 'https:');

	return [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		// Svelte transitions and floating-ui positioning write inline styles.
		"style-src 'self' 'unsafe-inline'",
		// github.com + avatars.githubusercontent.com serve the /components
		// avatar demo — remove them along with it.
		`img-src 'self' data: blob: ${supabase} https://github.com https://avatars.githubusercontent.com`,
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
	{ dev = false } = {}
): Response {
	response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(supabaseUrl, { dev }));
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return response;
}
