import { error } from '@sveltejs/kit';
import { streamRequestSchema } from '$lib/ai/schemas';
import { assistantContext } from '$lib/server/ai/context';
import { chatModel, isAiConfigured, modelId } from '$lib/server/ai/provider';
import { streamAssistantTurn } from '$lib/server/ai/stream';
import type { RequestHandler } from './$types';

/**
 * The assistant's one endpoint: the `Chat` in the page posts here and reads
 * the UI message stream back. It sits under the feature's route, so the hook
 * has already checked the session, the feature mode and the read grant, and
 * `locals.org` is populated for the tool context. The turn itself is
 * `streamAssistantTurn` in `src/lib/server/ai/stream.ts`; this file only
 * turns a request into its inputs.
 */

/**
 * Vercel runs this as a serverless function and streaming does not extend
 * its life: the tool loop has to finish inside `maxDuration`. Fluid Compute
 * allows up to 300s on every plan; two minutes leaves room for a long loop
 * without letting a stuck one run for five.
 */
export const config = { maxDuration: 120 };

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isAiConfigured()) {
		throw error(503, 'The assistant is not configured. Set ANTHROPIC_API_KEY on the server.');
	}
	const context = assistantContext(locals);

	const body = streamRequestSchema.safeParse(await request.json().catch(() => undefined));
	if (!body.success) throw error(400, 'Invalid request body.');

	return streamAssistantTurn({
		request: body.data,
		context,
		model: chatModel(),
		modelId: modelId(),
		userName: locals.user?.email
	});
};
