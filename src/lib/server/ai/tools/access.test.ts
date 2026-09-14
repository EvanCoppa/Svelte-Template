import { describe, expect, it } from 'vitest';
import { orgContext, toolContext } from '../test-support';
import {
	anyRecordAccess,
	canOpenFor,
	isToolActive,
	recordAccess,
	recordKindAccess,
	requireToolContext
} from './access';

describe('isToolActive', () => {
	it('needs the feature enabled AND the level held', () => {
		expect(isToolActive(orgContext(), { feature: 'tasks', level: 'delete' })).toBe(true);
		expect(
			isToolActive(orgContext({ modes: { tasks: 'disabled' } }), {
				feature: 'tasks',
				level: 'read'
			})
		).toBe(false);
		expect(
			isToolActive(orgContext({ role: 'member', grants: { tasks: 'read' } }), {
				feature: 'tasks',
				level: 'manage'
			})
		).toBe(false);
		expect(
			isToolActive(orgContext({ role: 'member', grants: { tasks: 'manage' } }), {
				feature: 'tasks',
				level: 'read'
			})
		).toBe(true);
	});
});

describe('requireToolContext', () => {
	it('returns the context when the tool is active', () => {
		const context = toolContext();
		expect(requireToolContext(context, { feature: 'companies', level: 'read' })).toBe(context);
	});

	it('throws a readable error the model can relay when it is not', () => {
		const context = toolContext(orgContext({ role: 'member', grants: { companies: 'read' } }));
		expect(() => requireToolContext(context, { feature: 'companies', level: 'manage' })).toThrow(
			/does not allow "manage" on companies/
		);
	});
});

describe('kind-addressed access', () => {
	it('names the kind’s feature for one call', () => {
		expect(recordAccess('contact', 'manage')).toEqual({ feature: 'contacts', level: 'manage' });
		expect(recordAccess('rma', 'read')).toEqual({ feature: 'rmas', level: 'read' });
	});

	it('offers a kind-addressed tool while ANY kind is open at the level', () => {
		expect(isToolActive(orgContext(), anyRecordAccess('read'))).toBe(true);
		expect(
			isToolActive(
				orgContext({ role: 'member', grants: { tickets: 'read' } }),
				anyRecordAccess('read')
			)
		).toBe(true);
		expect(
			isToolActive(
				orgContext({ role: 'member', grants: { tickets: 'read' } }),
				anyRecordAccess('manage')
			)
		).toBe(false);
		expect(isToolActive(orgContext({ role: 'member' }), anyRecordAccess('read'))).toBe(false);
	});

	it('refuses with a message that names no feature when no kind is open', () => {
		expect(() =>
			requireToolContext(toolContext(orgContext({ role: 'member' })), anyRecordAccess('read'))
		).toThrow(/does not allow "read" on any kind of record/);
	});

	it('answers canOpen the way the record page does: enabled for the org and readable by the caller', () => {
		const canOpen = canOpenFor(orgContext({ role: 'member', grants: { contacts: 'read' } }));
		expect(canOpen('contact')).toBe(true);
		expect(canOpen('company')).toBe(false);
		// A kind whose feature the org does not have at all (no row in the map).
		expect(canOpen('asset')).toBe(false);
		expect(canOpenFor(orgContext({ modes: { contacts: 'disabled' } }))('contact')).toBe(false);
	});

	it('lists the kinds a session may read, in the industry’s words, with what it may do', () => {
		const kinds = recordKindAccess(
			orgContext({ role: 'member', grants: { contacts: 'manage', deals: 'read' } })
		);
		expect(kinds).toEqual([
			{ kind: 'contact', name: 'contacts', noun: 'contact', canManage: true },
			{ kind: 'deal', name: 'deals', noun: 'deal', canManage: false }
		]);
		expect(recordKindAccess(orgContext({ role: 'member' }))).toEqual([]);
		expect(recordKindAccess(orgContext()).map((kind) => kind.kind)).toEqual([
			'company',
			'contact',
			'deal',
			'order',
			'shipment',
			'task',
			'ticket',
			// A page is a record kind too, so the session block names it and the
			// kind-addressed tools reach it (the documents migration).
			'document'
		]);
	});
});
