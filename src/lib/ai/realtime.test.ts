import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import {
	callState,
	callStatusLabel,
	captionOf,
	idleStatus,
	isConversationEvent,
	lastTurn,
	messageText,
	realtimeOrigins,
	voiceSession,
	IDLE_LIMIT_MS,
	IDLE_WARNING_MS
} from './realtime';

/** A message the way the SDK assembles one from a call's transcripts. */
function said(role: 'user' | 'assistant', ...texts: string[]): UIMessage {
	return {
		id: `${role}-${texts.join('/')}`,
		role,
		parts: texts.map((text) => ({ type: 'text', text }))
	};
}

describe('realtimeOrigins', () => {
	it('is the socket a call connects to, and only that', () => {
		expect(realtimeOrigins()).toEqual(['wss://api.openai.com']);
	});
});

describe('voiceSession', () => {
	it('states how the browser listens, and never what it is told', () => {
		const session = voiceSession();

		expect(session.turnDetection).toEqual({ type: 'semantic-vad' });
		expect(session.inputAudioTranscription).toEqual({});
		expect(session.outputModalities).toEqual(['audio']);
		// Both are the server's, applied when the client secret is minted — a
		// `session.update` that carried them could overwrite the org's own.
		expect(session).not.toHaveProperty('instructions');
		expect(session).not.toHaveProperty('voice');
	});

	it('hands out a fresh object, so one caller cannot edit the other one', () => {
		expect(voiceSession()).not.toBe(voiceSession());
	});
});

describe('callState', () => {
	const connected = { status: 'connected', isPlaying: false, working: false } as const;

	it('reads the session rather than keeping its own answer', () => {
		expect(callState({ ...connected, status: 'disconnected' })).toBe('idle');
		expect(callState({ ...connected, status: 'connecting' })).toBe('connecting');
		expect(callState({ ...connected, status: 'error' })).toBe('failed');
		expect(callState(connected)).toBe('listening');
		expect(callState({ ...connected, working: true })).toBe('thinking');
		expect(callState({ ...connected, isPlaying: true })).toBe('speaking');
	});

	it('lets speaking win over working: what you can hear is what it is doing', () => {
		expect(callState({ ...connected, isPlaying: true, working: true })).toBe('speaking');
	});

	it('has a line for every state', () => {
		const states = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'failed'] as const;
		for (const state of states) expect(callStatusLabel(state)).not.toBe('');
	});
});

describe('lastTurn', () => {
	it('joins the pieces one turn arrived in', () => {
		expect(messageText(said('assistant', 'Three deals', ' are open.'))).toBe(
			'Three deals are open.'
		);
	});

	it('is the last thing either side said', () => {
		const turn = lastTurn([said('user', 'How many deals?'), said('assistant', 'Three.')]);
		expect(turn).toEqual({ role: 'assistant', text: 'Three.' });
	});

	it('skips a turn that has arrived with no words in it yet', () => {
		const turn = lastTurn([said('user', 'Hello'), said('assistant', ''), said('assistant', '   ')]);
		expect(turn).toEqual({ role: 'user', text: 'Hello' });
		expect(lastTurn([])).toBeNull();
	});
});

describe('captionOf', () => {
	it('shows the words still being said when an answer runs long', () => {
		const long = { role: 'assistant', text: 'a'.repeat(300) } as const;
		const caption = captionOf(long, 240);

		expect(caption.startsWith('…')).toBe(true);
		expect(caption).toHaveLength(241);
		expect(captionOf({ role: 'user', text: 'short' })).toBe('short');
		expect(captionOf(null)).toBe('');
	});
});

describe('idleStatus', () => {
	it('warns before it hangs up, so a call never drops without saying so', () => {
		expect(idleStatus(0)).toBe('live');
		expect(idleStatus(IDLE_LIMIT_MS - IDLE_WARNING_MS - 1)).toBe('live');
		expect(idleStatus(IDLE_LIMIT_MS - IDLE_WARNING_MS)).toBe('warning');
		expect(idleStatus(IDLE_LIMIT_MS - 1)).toBe('warning');
		expect(idleStatus(IDLE_LIMIT_MS)).toBe('expired');
		expect(idleStatus(IDLE_LIMIT_MS * 10)).toBe('expired');
	});

	it('leaves enough silence for a pause and not enough for a night', () => {
		expect(IDLE_LIMIT_MS).toBeGreaterThan(60_000);
		expect(IDLE_LIMIT_MS).toBeLessThanOrEqual(5 * 60_000);
		expect(IDLE_WARNING_MS).toBeLessThan(IDLE_LIMIT_MS);
	});
});

describe('isConversationEvent', () => {
	it('counts anyone talking, and a tool being called, as the call being alive', () => {
		expect(isConversationEvent('speech-started')).toBe(true);
		expect(isConversationEvent('input-transcription-completed')).toBe(true);
		expect(isConversationEvent('audio-delta')).toBe(true);
		expect(isConversationEvent('response-created')).toBe(true);
		expect(isConversationEvent('function-call-arguments-done')).toBe(true);
	});

	it('does not let the session being set up, an error, or an unmapped event hold a call open', () => {
		expect(isConversationEvent('session-created')).toBe(false);
		expect(isConversationEvent('session-updated')).toBe(false);
		expect(isConversationEvent('error')).toBe(false);
		// `custom` is whatever the provider sent that the SDK does not map —
		// rate-limit notices and the like, which arrive on their own schedule.
		expect(isConversationEvent('custom')).toBe(false);
	});

	it('treats an event type it has never seen as somebody talking', () => {
		// Stated as what does NOT count, so a mapping the SDK adds later fails
		// towards keeping a live call rather than cutting one off mid-sentence.
		expect(isConversationEvent('some-event-a-later-sdk-maps')).toBe(true);
	});
});
