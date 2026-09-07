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

	it('asks the user before the destructive tool runs', () => {
		expect(TOOL_APPROVAL).toEqual({ deleteTask: 'user-approval' });
		expect(TOOL_ACCESS.deleteTask.level).toBe('delete');
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
		expect(activeToolNames(orgContext({ role: 'member', grants: { companies: 'read' } }))).toEqual([
			'searchCompanies',
			'getCompany'
		]);
	});

	it('walks the ladder: manage includes read, delete includes both', () => {
		const manage = activeToolNames(orgContext({ role: 'member', grants: { tasks: 'manage' } }));
		expect(manage.sort()).toEqual(['completeTask', 'createTask', 'listTasks']);

		const del = activeToolNames(orgContext({ role: 'member', grants: { tasks: 'delete' } }));
		expect(del.sort()).toEqual(['completeTask', 'createTask', 'deleteTask', 'listTasks']);
	});

	it('gives a member with no grants no tools at all', () => {
		expect(activeToolNames(orgContext({ role: 'member' }))).toEqual([]);
	});
});
