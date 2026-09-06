import { describe, expect, it } from 'vitest';
import {
	ASSISTANT_INSTRUCTIONS,
	buildInstructions,
	resolveTimeZone,
	sessionContext
} from './prompts';

const ctx = {
	orgName: 'Acme Inc',
	tierName: 'Pro',
	role: 'admin',
	userName: 'evan@example.com',
	timeZone: 'America/New_York',
	now: new Date('2026-09-06T15:30:00Z')
};

describe('resolveTimeZone', () => {
	it('keeps a valid zone and falls back to UTC otherwise', () => {
		expect(resolveTimeZone('Europe/Paris')).toBe('Europe/Paris');
		expect(resolveTimeZone('Mars/Olympus')).toBe('UTC');
		expect(resolveTimeZone(undefined)).toBe('UTC');
	});
});

describe('sessionContext', () => {
	it('names the org, plan, caller, role and local time', () => {
		const block = sessionContext(ctx);
		expect(block).toContain('<session_context>');
		expect(block).toContain('Organization: Acme Inc (Pro plan)');
		expect(block).toContain('User: evan@example.com (admin)');
		expect(block).toContain('Time zone: America/New_York');
		expect(block).toContain('Sunday, September 6, 2026 at 11:30 AM');
	});

	it('has a name for an anonymous caller', () => {
		expect(sessionContext({ ...ctx, userName: undefined })).toContain(
			'User: a team member (admin)'
		);
	});
});

describe('buildInstructions', () => {
	it('puts the cached persona first and the session block second', () => {
		const [persona, session, ...rest] = buildInstructions(ctx);
		expect(rest).toEqual([]);
		expect(persona).toMatchObject({
			role: 'system',
			content: ASSISTANT_INSTRUCTIONS,
			providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
		});
		expect(session.role).toBe('system');
		expect(session.content).toContain('Acme Inc');
		expect(session.providerOptions).toBeUndefined();
	});
});
