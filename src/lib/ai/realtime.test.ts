import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import {
	callState,
	callStatusLabel,
	captionOf,
	lastTurn,
	messageText,
	realtimeOrigins,
	voiceSession
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
