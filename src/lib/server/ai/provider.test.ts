import { describe, expect, it } from 'vitest';
import { aiConfig, chatModel, DEFAULT_MODEL_ID, isAiConfigured, modelId } from './provider';

describe('provider configuration', () => {
	it('is off without a key, and reports the default model id for logs', () => {
		expect(aiConfig({})).toBeNull();
		expect(aiConfig({ OPENAI_API_KEY: '   ' })).toBeNull();
		expect(isAiConfigured({})).toBe(false);
		expect(modelId({})).toBe(DEFAULT_MODEL_ID);
		expect(DEFAULT_MODEL_ID).toBe('gpt-5.6-luna');
	});

	it('trims the key and falls back to the default model', () => {
		expect(aiConfig({ OPENAI_API_KEY: ' sk-test ' })).toEqual({
			apiKey: 'sk-test',
			modelId: DEFAULT_MODEL_ID
		});
		expect(aiConfig({ OPENAI_API_KEY: 'sk-test', AI_MODEL: ' gpt-5.6-terra ' })).toEqual({
			apiKey: 'sk-test',
			modelId: 'gpt-5.6-terra'
		});
	});

	it('throws a readable error when a model is requested unconfigured', () => {
		expect(() => chatModel({})).toThrow('Set OPENAI_API_KEY');
	});

	it('builds the configured model without touching the network', () => {
		const model = chatModel({ OPENAI_API_KEY: 'sk-test', AI_MODEL: 'gpt-5.6-terra' });
		expect(model).toMatchObject({
			modelId: 'gpt-5.6-terra',
			provider: expect.stringContaining('openai')
		});
	});
});
