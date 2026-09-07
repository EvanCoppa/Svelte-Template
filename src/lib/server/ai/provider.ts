/**
 * The model provider (server-only).
 *
 * Every AI feature reaches a model through here: `chatModel()` for the
 * assistant's agent and for one-off generations such as a thread title,
 * `modelId()` for logs and message metadata. The provider package is
 * imported in this file and nowhere else, so swapping vendors is a change to
 * one module and two env keys while the rest of the app keeps talking to the
 * AI SDK's own `LanguageModel` type.
 *
 * Configuration is env-only (`ANTHROPIC_API_KEY`, `AI_MODEL` — see
 * `.env.example`). Like `sendEmail()`, an unconfigured provider is a clear,
 * early failure: the stream endpoint answers 503 before a request leaves the
 * server, never a stack trace from inside a stream.
 */
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { env } from '$env/dynamic/private';

/** The model used when `AI_MODEL` is not set. */
export const DEFAULT_MODEL_ID = 'claude-opus-5';

/**
 * The env vars the provider reads, injectable so tests can vary them. The
 * index signature keeps this from being a TS "weak type" — see `EmailEnv`.
 */
export interface AiEnv {
	ANTHROPIC_API_KEY?: string | undefined;
	AI_MODEL?: string | undefined;
	[key: string]: string | undefined;
}

export interface AiConfig {
	apiKey: string;
	modelId: string;
}

/** Resolve the provider configuration, or `null` when the assistant is off. */
export function aiConfig(source: AiEnv = env): AiConfig | null {
	const apiKey = (source.ANTHROPIC_API_KEY ?? '').trim();
	if (!apiKey) return null;
	const modelId = (source.AI_MODEL ?? '').trim() || DEFAULT_MODEL_ID;
	return { apiKey, modelId };
}

export function isAiConfigured(source: AiEnv = env): boolean {
	return aiConfig(source) !== null;
}

/** The model id in use, for metadata and logs — the default when unconfigured. */
export function modelId(source: AiEnv = env): string {
	return aiConfig(source)?.modelId ?? DEFAULT_MODEL_ID;
}

let cached: { apiKey: string; provider: AnthropicProvider } | null = null;

/** One provider instance per key; a key change (tests, rotation) rebuilds it. */
function provider(apiKey: string): AnthropicProvider {
	if (cached?.apiKey !== apiKey) {
		cached = { apiKey, provider: createAnthropic({ apiKey }) };
	}
	return cached.provider;
}

/**
 * The chat model. Throws when unconfigured — callers at the edge check
 * `isAiConfigured()` first and turn that into a readable 503.
 */
export function chatModel(source: AiEnv = env): LanguageModel {
	const config = aiConfig(source);
	if (!config) {
		throw new Error('The assistant is not configured. Set ANTHROPIC_API_KEY.');
	}
	return provider(config.apiKey)(config.modelId);
}
