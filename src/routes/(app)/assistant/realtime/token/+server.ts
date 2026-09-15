import { error, json } from '@sveltejs/kit';
import { realtimeTimeZoneSchema } from '$lib/ai/schemas';
import { assistantContext } from '$lib/server/ai/context';
import { isAiConfigured } from '$lib/server/ai/provider';
import { realtimeSetup } from '$lib/server/ai/realtime';
import type { RequestHandler } from './$types';

/**
 * Opens a voice call: mints the ephemeral secret the browser connects with
 * and lists the tools the model may call on it.
 *
 * A `+server.ts` endpoint rather than a form action because there is no form
 * — the request body is a session the browser is about to open, born in JS
 * memory, and the SDK's realtime session fetches this itself as its setup
 * endpoint (`api.token`). It sits under the feature's route, so the hook has
 * already checked the session, the `assistant` feature's mode and the read
 * grant, and `locals.org` is populated for the tool gate.
 *
 * The app's own key never leaves the server: what comes back is a short-lived
 * client secret, scoped to one session whose instructions, voice and tools
 * were all decided here.
 */
export const POST: RequestHandler = async ({ url, locals }) => {
	if (!isAiConfigured()) {
		throw error(503, 'The assistant is not configured. Set OPENAI_API_KEY on the server.');
	}
	const context = assistantContext(locals);

	// The SDK posts the session config it is about to send, which the server
	// has no use for — it writes its own. What it does need is where the caller
	// is, so that "today" on a call resolves the way it does on a typed turn,
	// and that rides in the URL because the body is the SDK's to shape.
	const timeZone = realtimeTimeZoneSchema.safeParse(url.searchParams.get('tz'));

	return json(
		await realtimeSetup({
			context,
			timeZone: timeZone.success ? timeZone.data : undefined,
			userName: locals.user?.email
		})
	);
};
