import { describe, expect, it } from 'vitest';
import { aiConfig, chatModel, DEFAULT_MODEL_ID, isAiConfigured, modelId } from './provider';

describe('provider configuration', () => {
	it('is off without a key, and reports the default model id for logs', () => {
		expect(aiConfig({})).toBeNull();
		expect(aiConfig({ ANTHROPIC_API_KEY: '   ' })).toBeNull();
		expect(isAiConfigured({})).toBe(false);
		expect(modelId({})).toBe(DEFAULT_MODEL_ID);
	});

	it('trims the key and falls back to the default model', () => {
		expect(aiConfig({ ANTHROPIC_API_KEY: ' sk-test ' })).toEqual({
			apiKey: 'sk-test',
			modelId: DEFAULT_MODEL_ID
		});
		expect(aiConfig({ ANTHROPIC_API_KEY: 'sk-test', AI_MODEL: ' claude-sonnet-5 ' })).toEqual({
			apiKey: 'sk-test',
			modelId: 'claude-sonnet-5'
		});
	});

	it('throws a readable error when a model is requested unconfigured', () => {
		expect(() => chatModel({})).toThrow('Set ANTHROPIC_API_KEY');
	});

	it('builds the configured model without touching the network', () => {
		const model = chatModel({ ANTHROPIC_API_KEY: 'sk-test', AI_MODEL: 'claude-sonnet-5' });
		expect(model).toMatchObject({
			modelId: 'claude-sonnet-5',
			provider: expect.stringContaining('anthropic')
		});
	});
});
