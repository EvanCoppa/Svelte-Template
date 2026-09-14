import { describe, expect, it } from 'vitest';
import { TOOL_LABELS } from '$lib/ai/labels';
import { orgContext, toolContext } from '../test-support';
import {
	activeToolNames,
	assistantTools,
	TOOL_ACCESS,
	TOOL_APPROVAL,
	TOOL_NAMES,
	toolsContextFor
} from './index';

describe('the tool registry', () => {
	it('declares access and a label for every tool, and nothing else', () => {
		const names = Object.keys(assistantTools).sort();
		expect(Object.keys(TOOL_ACCESS).sort()).toEqual(names);
		expect(Object.keys(TOOL_LABELS).sort()).toEqual(names);
		expect([...TOOL_NAMES].sort()).toEqual(names);
	});

	it('asks the user before the destructive tool runs, and before an edit lands', () => {
		expect(TOOL_APPROVAL).toEqual({ deleteTask: 'user-approval', updateRecord: 'user-approval' });
		expect(TOOL_ACCESS.deleteTask.level).toBe('delete');
		expect(TOOL_ACCESS.updateRecord.level).toBe('manage');
	});

	it('hands every tool the same request context, keyed by tool name', () => {
		const context = toolContext();
		const map = toolsContextFor(context);
		expect(Object.keys(map).sort()).toEqual([...TOOL_NAMES].sort());
		for (const name of TOOL_NAMES) expect(map[name]).toBe(context);
	});
});

describe('activeToolNames — tools are linked to features', () => {
	it('gives an owner every tool when every feature is enabled', () => {
		expect(activeToolNames(orgContext()).sort()).toEqual([...TOOL_NAMES].sort());
	});

	it('drops a feature’s tools when the org switched it off', () => {
		const names = activeToolNames(orgContext({ modes: { tasks: 'disabled' } }));
		expect(names).not.toContain('listTasks');
		expect(names).not.toContain('createTask');
		expect(names).not.toContain('completeTask');
		expect(names).not.toContain('deleteTask');
		expect(names).toContain('searchCompanies');
	});

	it.each(['locked_visible', 'hidden'] as const)(
		'drops a feature’s tools when its mode is %s, even for an owner',
		(mode) => {
			const names = activeToolNames(orgContext({ modes: { deals: mode } }));
			expect(names).not.toContain('listDeals');
			expect(names).toContain('listTickets');
		}
	);

	it('gives a member only what their grants reach', () => {
		expect(
			activeToolNames(orgContext({ role: 'member', grants: { companies: 'read' } })).sort()
		).toEqual([
			'findRecords',
			'getCompany',
			'getRecord',
			'listRecords',
			'listRelationshipTypes',
			'searchCompanies'
		]);
	});

	it('walks the ladder: manage includes read, delete includes both', () => {
		const manage = activeToolNames(orgContext({ role: 'member', grants: { tasks: 'manage' } }));
		expect(manage.sort()).toEqual([
			'completeTask',
			'createTask',
			'findRecords',
			'getRecord',
			'linkRecords',
			'listRecords',
			'listRelationshipTypes',
			'listTasks',
			'updateRecord'
		]);

		const del = activeToolNames(orgContext({ role: 'member', grants: { tasks: 'delete' } }));
		expect(del.sort()).toEqual([
			'completeTask',
			'createTask',
			'deleteTask',
			'findRecords',
			'getRecord',
			'linkRecords',
			'listRecords',
			'listRelationshipTypes',
			'listTasks',
			'updateRecord'
		]);
	});

	it('offers a kind-addressed tool while any kind of record is open, and withdraws it when none is', () => {
		// Every record kind off for the org: the generic tools go with them,
		// while a tool about a feature that is not a kind (the calendar) stays.
		const kindsOff = activeToolNames(
			orgContext({
				modes: {
					companies: 'disabled',
					contacts: 'hidden',
					deals: 'locked_visible',
					tasks: 'disabled',
					tickets: 'disabled',
					orders: 'disabled',
					shipments: 'disabled'
				}
			})
		);
		expect(kindsOff).not.toContain('findRecords');
		expect(kindsOff).not.toContain('getRecord');
		expect(kindsOff).not.toContain('updateRecord');
		expect(kindsOff).not.toContain('linkRecords');
		expect(kindsOff).not.toContain('listRelationshipTypes');
		expect(kindsOff).not.toContain('listRecords');
		expect(kindsOff).toContain('listEvents');

		// Reading tickets alone is enough to be offered the reading tools, not the writing ones.
		const reader = activeToolNames(orgContext({ role: 'member', grants: { tickets: 'read' } }));
		expect(reader.sort()).toEqual([
			'findRecords',
			'getRecord',
			'listRecords',
			'listRelationshipTypes',
			'listTickets'
		]);
	});

	it('links the graph walk to the graph feature and the calendar tool to the calendar', () => {
		expect(TOOL_ACCESS.exploreGraph).toEqual({ feature: 'graph', level: 'read' });
		expect(TOOL_ACCESS.listEvents).toEqual({ feature: 'calendar', level: 'read' });
		expect(activeToolNames(orgContext({ modes: { graph: 'disabled' } }))).not.toContain(
			'exploreGraph'
		);
		expect(activeToolNames(orgContext({ modes: { calendar: 'hidden' } }))).not.toContain(
			'listEvents'
		);
	});

	it('links the artifact tools to the features their cards act on', () => {
		expect(TOOL_ACCESS.findOpenSlots).toEqual({ feature: 'calendar', level: 'read' });
		expect(TOOL_ACCESS.packableLines).toEqual({ feature: 'shipments', level: 'manage' });
		expect(activeToolNames(orgContext({ modes: { calendar: 'hidden' } }))).not.toContain(
			'findOpenSlots'
		);
		expect(activeToolNames(orgContext({ modes: { shipments: 'disabled' } }))).not.toContain(
			'packableLines'
		);
		// The card opens a box, so reading shipments is not enough to be offered it.
		expect(
			activeToolNames(orgContext({ role: 'member', grants: { shipments: 'read', orders: 'read' } }))
		).not.toContain('packableLines');
	});

	it('gives a member with no grants no tools at all', () => {
		expect(activeToolNames(orgContext({ role: 'member' }))).toEqual([]);
	});
});
