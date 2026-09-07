import { describe, expect, it } from 'vitest';
import { orgContext, toolContext } from '../test-support';
import { isToolActive, requireToolContext } from './access';

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
