import type {
	Experimental_RealtimeSessionConfig as RealtimeSessionConfig,
	JSONValue,
	UIMessage
} from 'ai';

/**
 * The voice call, as the parts of it that are pure.
 *
 * A call is the assistant with the typing taken out: the same tools over the
 * same organization's data, reached by talking instead of writing. The live
 * connection belongs to `$lib/ai/realtime.svelte` (the SDK session as a rune
 * class) and the screen to `Assistant.Call`; what is here is everything both
 * of them need that is only a function of values — which is also what a test
 * can hold still.
 *
 * Client-safe: no provider package, no key, nothing from `$lib/server`. The
 * ephemeral token a call connects with is minted by
 * `/assistant/realtime/token` and never lives longer than the call.
 */

/**
 * The realtime API's WebSocket endpoint — the one host a call talks to, and
 * the only thing about it the browser needs to know. The provider itself is
 * named on the server (`$lib/server/ai/provider`); this is the address the
 * Content-Security-Policy has to admit, so it lives where both the hook and
 * the browser can read it.
 */
const REALTIME_WS_URL = 'wss://api.openai.com/v1/realtime';

/**
 * The origins a call connects to, for `connect-src` — derived from the URL
 * above the way `mapOrigins()` derives the map's from its style URLs, so
 * moving the endpoint moves the policy with it rather than leaving a
 * hardcoded host behind. Only the socket: the token endpoint is our own, and
 * the browser fetches nothing else from the provider.
 */
export function realtimeOrigins(): string[] {
	return [new URL(REALTIME_WS_URL).origin];
}

/**
 * How the session listens and what it transcribes — the settings that are
 * safe to state from the browser, and the ones the token endpoint repeats
 * when it mints the client secret so the two can never disagree.
 *
 * `semantic-vad` rather than a loudness threshold: the model decides the
 * caller has finished a thought rather than that they have gone quiet, which
 * is the difference between a conversation and being cut off mid-sentence.
 * Input transcription is what puts the caller's own words on screen; output
 * needs no setting, because the provider transcribes what it speaks anyway —
 * and that transcript is the assistant's side of the caption.
 *
 * `instructions` and `voice` are deliberately absent: both are the server's,
 * applied when the client secret is minted. A `session.update` only changes
 * the fields it carries, so leaving them out here leaves the server's
 * standing.
 */
export function voiceSession() {
	return {
		outputModalities: ['audio'],
		turnDetection: { type: 'semantic-vad' },
		inputAudioTranscription: {}
	} satisfies Partial<RealtimeSessionConfig>;
}

/**
 * The two limits on a call, and how long before each one it says so.
 *
 * A call is metered: an open socket with a live microphone costs money for
 * every minute it is up, so it is bounded twice. **Idle** is dead air — two
 * minutes is well past a pause for thought and well short of a bill nobody
 * meant to run up, and a tab left open in the background would otherwise
 * spend it all night. **Length** is the call itself: half an hour is longer
 * than any question about a business takes, and a call that has run that long
 * is almost always one somebody walked away from mid-conversation, which dead
 * air alone never catches.
 *
 * Both warn before they act, because a call that drops with no notice reads
 * as a bug. Neither loses anything: starting another is one press, and the
 * assistant remembers nothing between calls anyway.
 */
export const IDLE_LIMIT_MS = 120_000;
export const IDLE_WARNING_MS = 30_000;
export const MAX_CALL_MS = 30 * 60_000;
export const MAX_CALL_WARNING_MS = 60_000;

/**
 * Whether a call carries on, and what to say about it — one decision rather
 * than a limit each, so the two can never disagree about which applies and
 * the screen has one line to read. The words live here with the numbers they
 * belong to, the way `callStatusLabel()` does.
 */
export type CallLimit =
	{ status: 'live' } | { status: 'warning'; notice: string } | { status: 'ended'; reason: string };

export function callLimit({
	openForMs,
	silentForMs
}: {
	/** How long the call has been up. */
	openForMs: number;
	/** How long since anybody last said anything. */
	silentForMs: number;
}): CallLimit {
	if (openForMs >= MAX_CALL_MS) {
		return {
			status: 'ended',
			reason: 'This call reached its thirty-minute limit. Start another whenever you like.'
		};
	}
	if (silentForMs >= IDLE_LIMIT_MS) {
		return { status: 'ended', reason: 'The call ended because nobody was talking.' };
	}
	// The nearer deadline is the one worth saying out loud, and silence is
	// always the nearer one where both apply.
	if (silentForMs >= IDLE_LIMIT_MS - IDLE_WARNING_MS) {
		return { status: 'warning', notice: 'Still there? The call will end in a moment.' };
	}
	if (openForMs >= MAX_CALL_MS - MAX_CALL_WARNING_MS) {
		return { status: 'warning', notice: 'This call is about to reach its thirty-minute limit.' };
	}
	return { status: 'live' };
}

/**
 * The normalized server events that say nothing about whether anyone is still
 * on the call: the session being set up, an error, and whatever the provider
 * sent that the SDK does not map (`custom` — rate-limit notices and the like,
 * which arrive on their own schedule).
 *
 * Stated as what does NOT count on purpose. A call is kept alive by anything
 * else, so an event type the SDK maps in a future version counts as somebody
 * talking rather than being silently ignored — a new event that failed to
 * reset the clock would hang up a call mid-sentence, and one that resets it
 * needlessly only costs a call that was going to be hung up anyway.
 */
const QUIET_EVENTS = new Set(['session-created', 'session-updated', 'error', 'custom']);

/** Whether one server event means the conversation moved. */
export function isConversationEvent(type: string): boolean {
	return !QUIET_EVENTS.has(type);
}

/**
 * What the model asked for during a call: a tool by name, and arguments that
 * only that tool's own schema can judge — so they travel as the JSON they
 * arrived as, and the server validates them against the named tool before
 * anything runs.
 */
export type VoiceToolCall = { name: string; input: JSONValue };

/**
 * What a tool answers with: its own result, or `{ error }` when it failed,
 * which the model reads and says out loud. Either way it goes back to the
 * model as JSON, which is the whole of the contract at this boundary.
 */
export type VoiceToolResult = JSONValue;

/**
 * What the orb is doing, which is the one thing the screen reads. Derived
 * from the session's own state rather than tracked beside it: a second copy
 * of "is it speaking" would be a second answer the moment one of them lagged.
 */
export type CallState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'failed';

export function callState({
	status,
	isPlaying,
	working
}: {
	status: 'disconnected' | 'connecting' | 'connected' | 'error';
	/** True while the model's audio is coming out of the speakers. */
	isPlaying: boolean;
	/** True while a tool the model called is still running. */
	working: boolean;
}): CallState {
	if (status === 'error') return 'failed';
	if (status === 'connecting') return 'connecting';
	if (status === 'disconnected') return 'idle';
	if (isPlaying) return 'speaking';
	if (working) return 'thinking';
	return 'listening';
}

/** What the screen says under the orb. One line, in the language of a call. */
export function callStatusLabel(state: CallState): string {
	switch (state) {
		case 'connecting':
			return 'Connecting…';
		case 'listening':
			return 'Listening';
		case 'thinking':
			return 'Looking it up';
		case 'speaking':
			return 'Speaking';
		case 'failed':
			return 'The call ended unexpectedly';
		case 'idle':
			return 'Ready when you are';
	}
}

/** One turn of the call, as the caption under the orb shows it. */
export type CallTurn = { role: 'user' | 'assistant'; text: string };

/**
 * The last thing either side said, which is the caption. The SDK assembles
 * spoken audio into the same `UIMessage`s the typed thread uses — the model's
 * from its output transcript, the caller's from input transcription — so
 * reading the caption off the messages is reading the transcript itself,
 * never a second copy kept in step by hand.
 */
export function lastTurn(messages: readonly UIMessage[]): CallTurn | null {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message.role !== 'user' && message.role !== 'assistant') continue;
		const text = messageText(message);
		if (text) return { role: message.role, text };
	}
	return null;
}

/** Every text part of one message, joined — the SDK streams a turn in pieces. */
export function messageText(message: UIMessage): string {
	return message.parts
		.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
		.map((part) => part.text)
		.join('')
		.trim();
}

/**
 * A caption is spoken language, and a long answer would push the orb off the
 * screen, so what is shown is the tail — the words still being said.
 */
export function captionOf(turn: CallTurn | null, limit = 240): string {
	if (!turn) return '';
	if (turn.text.length <= limit) return turn.text;
	return `…${turn.text.slice(turn.text.length - limit)}`;
}
