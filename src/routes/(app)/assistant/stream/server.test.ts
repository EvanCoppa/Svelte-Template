import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { POST } from './+server';

/**
 * The endpoint's own two answers — before any provider or thread is touched.
 * The turn itself is tested in `src/lib/server/ai/stream.test.ts`. With no
 * ANTHROPIC_API_KEY in the test environment the assistant is unconfigured,
 * which is the case the first test needs.
 */

async function statusOf(run: () => Response | Promise<Response>): Promise<number> {
	try {
		return (await run()).status;
	} catch (thrown) {
		if (isHttpError(thrown)) return thrown.status;
		throw thrown;
	}
}

describe('POST /assistant/stream', () => {
	it('answers 503 when the provider is not configured, before reading the body', async () => {
		let bodyRead = false;
		const event = {
			request: {
				json: async () => {
					bodyRead = true;
					return {};
				}
			},
			locals: {}
		};
		// SAFETY: the handler exits on the provider check; the rest of RequestEvent is never read.
		await expect(statusOf(() => POST(event as never))).resolves.toBe(503);
		expect(bodyRead).toBe(false);
	});
});
