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

	it('lists the kinds of record the session may use, and nothing about kinds when there are none', () => {
		const block = sessionContext({
			...ctx,
			kinds: [
				{ kind: 'contact', name: 'Patients', noun: 'patient', canCreate: true, canUpdate: true },
				// A document with a lifecycle: it can be drafted, but changing
				// one is its own page's business, never the edit form's.
				{ kind: 'invoice', name: 'Invoices', noun: 'invoice', canCreate: true, canUpdate: false },
				{
					kind: 'proposal',
					name: 'Treatment plans',
					noun: 'treatment plan',
					canCreate: false,
					canUpdate: false
				}
			]
		});
		expect(block).toContain('Record kinds here');
		expect(block).toContain('- contact — Patients (one: patient) — read, create, update');
		expect(block).toContain('- invoice — Invoices (one: invoice) — read, create');
		expect(block).toContain('- proposal — Treatment plans (one: treatment plan) — read');

		expect(sessionContext(ctx)).not.toContain('Record kinds');
		expect(sessionContext({ ...ctx, kinds: [] })).not.toContain('Record kinds');
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
		expect(persona).toEqual({ role: 'system', content: ASSISTANT_INSTRUCTIONS });
		expect(session.role).toBe('system');
		expect(session.content).toContain('Acme Inc');
	});
});
