import { describe, expect, it } from 'vitest';
import { createAssistantAgent, MAX_STEPS } from './agent';
import { orgContext, streamingModel, toolContext } from './test-support';
import { activeToolNames } from './tools';

/**
 * The agent, driven end to end against the SDK's mock model: what reaches the
 * model is what the SDK sends it, so these assert the wiring, not our own
 * bookkeeping.
 */

describe('createAssistantAgent', () => {
	it('sends the model only the tools the caller may use', async () => {
		const org = orgContext({ role: 'member', grants: { companies: 'read', tasks: 'manage' } });
		const model = streamingModel('Hello');
		const agent = createAssistantAgent({ model, context: toolContext(org) });

		const result = await agent.stream({ prompt: 'Hello?' });
		await expect(result.text).resolves.toBe('Hello');

		const sent = (model.doStreamCalls[0]?.tools ?? []).map((tool) => tool.name).sort();
		expect(sent).toEqual([...activeToolNames(org)].sort());
		expect(sent).toEqual([
			'completeTask',
			'createTask',
			'getCompany',
			'listTasks',
			'searchCompanies'
		]);
	});

	it('sends no tools at all to a member without grants', async () => {
		const model = streamingModel('Hi');
		const agent = createAssistantAgent({
			model,
			context: toolContext(orgContext({ role: 'member' }))
		});

		await (
			await agent.stream({ prompt: 'Hi' })
		).text;
		expect(model.doStreamCalls[0]?.tools ?? []).toEqual([]);
	});

	it('leads with the cached persona, then the session block naming the org and caller', async () => {
		const model = streamingModel('Hi');
		const agent = createAssistantAgent({
			model,
			context: toolContext(),
			timeZone: 'Europe/Paris',
			userName: 'evan@example.com'
		});

		await (
			await agent.stream({ prompt: 'Hi' })
		).text;

		const prompt = model.doStreamCalls[0]?.prompt ?? [];
		const system = prompt.filter((message) => message.role === 'system');
		expect(system).toHaveLength(2);
		expect(system[0]?.providerOptions).toEqual({
			anthropic: { cacheControl: { type: 'ephemeral' } }
		});
		expect(system[1]?.content).toContain('Organization: Acme Inc (Pro plan)');
		expect(system[1]?.content).toContain('User: evan@example.com (owner)');
		expect(system[1]?.content).toContain('Time zone: Europe/Paris');
	});

	it('caps the tool loop', () => {
		expect(MAX_STEPS).toBeGreaterThan(1);
	});
});
