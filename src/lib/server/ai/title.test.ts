import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateConversationTitle } from './title';

function modelSaying(text: string) {
	return new MockLanguageModelV4({
		doGenerate: async () => ({
			content: [{ type: 'text', text }],
			finishReason: { unified: 'stop', raw: undefined },
			usage: {
				inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
				outputTokens: { total: 5, text: 5, reasoning: undefined }
			},
			warnings: []
		})
	});
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('generateConversationTitle', () => {
	it('strips quotes and trailing punctuation from what the model wrote', async () => {
		await expect(
			generateConversationTitle(modelSaying('"Renewal quote timing."'), 'When is the renewal due?')
		).resolves.toBe('Renewal quote timing');
	});

	it('does not call the model for an empty opening message', async () => {
		const model = modelSaying('Whatever');
		await expect(generateConversationTitle(model, '   ')).resolves.toBeNull();
		expect(model.doGenerateCalls).toHaveLength(0);
	});

	it('is best-effort: a model failure yields no title, not an error', async () => {
		const model = new MockLanguageModelV4({
			doGenerate: async () => {
				throw new Error('upstream down');
			}
		});
		await expect(generateConversationTitle(model, 'Hello')).resolves.toBeNull();
	});
});
