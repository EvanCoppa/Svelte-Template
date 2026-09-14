import { error, json } from '@sveltejs/kit';
import { realtimeToolRequestSchema } from '$lib/ai/schemas';
import { assistantContext } from '$lib/server/ai/context';
import { isAiConfigured } from '$lib/server/ai/provider';
import { runVoiceTool } from '$lib/server/ai/realtime';
import type { RequestHandler } from './$types';

/**
 * Runs one tool the model asked for during a call.
 *
 * On a typed turn the agent runs its own tools inside the loop; on a call the
 * model is at the other end of a socket the browser holds, so the call comes
 * back here to be run with the caller's session — which is the point: the
 * browser is a relay, not the thing with the permissions. The gate, the
 * validation and the execution are `runVoiceTool()`; this file is the door.
 *
 * The body is the tool's output, whatever it is — a result, or `{ error }`
 * when the tool itself failed, which the model reads and says out loud.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isAiConfigured()) {
		throw error(503, 'The assistant is not configured. Set OPENAI_API_KEY on the server.');
	}
	const context = assistantContext(locals);

	const body = realtimeToolRequestSchema.safeParse(await request.json().catch(() => undefined));
	if (!body.success) throw error(400, 'Invalid request body.');

	return json(await runVoiceTool(context, body.data.name, body.data.input));
};
