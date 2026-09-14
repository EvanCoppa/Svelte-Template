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
 * The provider is OpenAI, over its Responses API (what `createOpenAI()`'s
 * model factory selects for a GPT-5 model). Configuration is env-only
 * (`OPENAI_API_KEY`, `AI_MODEL` — see `.env.example`). Like `sendEmail()`,
 * an unconfigured provider is a clear, early failure: the stream endpoint
 * answers 503 before a request leaves the server, never a stack trace from
 * inside a stream. What the API is asked for on a call — storage, prompt
 * caching — is `openaiCallOptions()` below, set as the SDK's `providerOptions`
 * on the calls that make them.
 */
import {
	createOpenAI,
	type OpenAILanguageModelResponsesOptions,
	type OpenAIProvider
} from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { env } from '$env/dynamic/private';

/** The model used when `AI_MODEL` is not set. */
export const DEFAULT_MODEL_ID = 'gpt-5.6-luna';

/**
 * The env vars the provider reads, injectable so tests can vary them. The
 * index signature keeps this from being a TS "weak type" — see `EmailEnv`.
 */
export interface AiEnv {
	OPENAI_API_KEY?: string | undefined;
	AI_MODEL?: string | undefined;
	[key: string]: string | undefined;
}

export interface AiConfig {
	apiKey: string;
	modelId: string;
}

/** Resolve the provider configuration, or `null` when the assistant is off. */
export function aiConfig(source: AiEnv = env): AiConfig | null {
	const apiKey = (source.OPENAI_API_KEY ?? '').trim();
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

/**
 * What OpenAI's Responses API is asked for on every call, as the SDK's
 * namespaced `providerOptions` — the one place a setting of the API rather
 * than of the SDK is spelled. Set on the agent and on the title call alike.
 *
 * - `store: false` — a turn over an organization's CRM data is not kept on
 *   OpenAI's side for later retrieval; the thread is ours (`conversations.ts`)
 *   and the SDK carries the model's encrypted reasoning between steps itself.
 * - `promptCacheKey` — the thread id, so the cached prefix (instructions,
 *   tools, the thread so far) is routed to the same cache on every turn.
 * - `reasoningSummary` — ask a reasoning model to emit a plain-language summary
 *   of its thinking. **Without it the Responses API streams no reasoning text
 *   at all**, so the SDK's `reasoning` parts arrive empty and the assistant's
 *   thinking block has nothing to show. Off by default because it only makes
 *   sense where reasoning is on: the title call turns reasoning off, and asking
 *   a model that is not thinking to summarise its thinking is meaningless.
 */
export function openaiCallOptions({
	conversationId,
	reasoningSummary = false
}: {
	conversationId?: string | undefined;
	reasoningSummary?: boolean | undefined;
} = {}): OpenAILanguageModelResponsesOptions {
	const options: OpenAILanguageModelResponsesOptions = { store: false };
	if (conversationId) options.promptCacheKey = conversationId;
	if (reasoningSummary) options.reasoningSummary = 'auto';
	return options;
}

let cached: { apiKey: string; provider: OpenAIProvider } | null = null;

/** One provider instance per key; a key change (tests, rotation) rebuilds it. */
function provider(apiKey: string): OpenAIProvider {
	if (cached?.apiKey !== apiKey) {
		cached = { apiKey, provider: createOpenAI({ apiKey }) };
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
		throw new Error('The assistant is not configured. Set OPENAI_API_KEY.');
	}
	return provider(config.apiKey)(config.modelId);
}
