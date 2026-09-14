/**
 * The model provider (server-only).
 *
 * Every AI feature reaches a model through here: `chatModel()` for the
 * assistant's agent and for one-off generations such as a thread title,
 * `modelId()` for logs and message metadata, and `realtimeToken()` for a
 * voice call. The provider package is imported in this file and — for the one
 * thing a server cannot do, parsing a call's events in the browser — in
 * `$lib/ai/realtime.svelte`, so swapping vendors is a change to two modules
 * and a handful of env keys while the rest of the app keeps talking to the AI
 * SDK's own types.
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
import type {
	Experimental_RealtimeFactoryGetTokenResult as RealtimeToken,
	Experimental_RealtimeSessionConfig as RealtimeSessionConfig,
	LanguageModel
} from 'ai';
import { env } from '$env/dynamic/private';

/** The model used when `AI_MODEL` is not set. */
export const DEFAULT_MODEL_ID = 'gpt-5.6-luna';

/**
 * The model a voice call uses when `AI_REALTIME_MODEL` is not set. A realtime
 * model is a different model from the one that answers typing — it hears and
 * speaks — so it is its own setting rather than a mode of `AI_MODEL`.
 */
export const DEFAULT_REALTIME_MODEL_ID = 'gpt-realtime-2.1';

/** The voice a call speaks in when `AI_REALTIME_VOICE` is not set. */
export const DEFAULT_VOICE = 'marin';

/**
 * How long a minted client secret stays usable. The browser connects with it
 * the moment it has it, so this only has to survive a slow handshake — two
 * minutes is generous for that and a good deal tighter than the ten the API
 * would give it, which is the window a leaked one would otherwise be worth
 * something in.
 *
 * It bounds starting a call, not the length of one: the idle timeout in
 * `$lib/ai/realtime` is what ends a call nobody is on.
 */
const TOKEN_TTL_SECONDS = 120;

/**
 * The env vars the provider reads, injectable so tests can vary them. The
 * index signature keeps this from being a TS "weak type" — see `EmailEnv`.
 */
export interface AiEnv {
	OPENAI_API_KEY?: string | undefined;
	AI_MODEL?: string | undefined;
	AI_REALTIME_MODEL?: string | undefined;
	AI_REALTIME_VOICE?: string | undefined;
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

/** The realtime model a voice call connects to. */
export function realtimeModelId(source: AiEnv = env): string {
	return (source.AI_REALTIME_MODEL ?? '').trim() || DEFAULT_REALTIME_MODEL_ID;
}

/** The voice it speaks in. */
export function realtimeVoice(source: AiEnv = env): string {
	return (source.AI_REALTIME_VOICE ?? '').trim() || DEFAULT_VOICE;
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

/**
 * An ephemeral client secret for one voice call — the SDK's
 * `experimental_realtime.getToken()`, which is the only part of a call that
 * ever sees the app's key. The browser builds its own half of the same model
 * to parse and serialise events (`$lib/ai/realtime.svelte`) and connects with
 * the short-lived secret this returns.
 *
 * The session config goes in at mint time on purpose: `instructions` (which
 * carry the organization's context) and `voice` are then the server's, and a
 * `session.update` from the browser only changes the fields it carries.
 */
export function realtimeToken(
	sessionConfig: RealtimeSessionConfig,
	source: AiEnv = env
): Promise<RealtimeToken> {
	const config = aiConfig(source);
	if (!config) {
		throw new Error('The assistant is not configured. Set OPENAI_API_KEY.');
	}
	return provider(config.apiKey).experimental_realtime.getToken({
		model: realtimeModelId(source),
		sessionConfig,
		expiresAfterSeconds: TOKEN_TTL_SECONDS
	});
}
