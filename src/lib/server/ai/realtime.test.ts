import { describe, expect, it } from 'vitest';
import { VOICE_INSTRUCTIONS } from './prompts';
import { runVoiceTool, voiceSessionConfig, voiceToolNames } from './realtime';
import { orgContext, ORG_ID, toolContext } from './test-support';

/**
 * A call is the same assistant: the same tools, gated the same way, run with
 * the same client. What these hold still is the three places it differs —
 * the tool it will not offer, the session it is opened with, and the one
 * request that runs a tool on its behalf.
 */

const TASK_ID = '50000000-0000-0000-0000-000000000001';

describe('voiceToolNames', () => {
	it('leaves out the tool that would ask for approval, because a call has no card to ask on', () => {
		const names = voiceToolNames(orgContext());

		expect(names).toContain('listTasks');
		expect(names).toContain('createTask');
		expect(names).not.toContain('deleteTask');
	});

	it('is gated exactly as a typed turn is', () => {
		expect(voiceToolNames(orgContext({ modes: { tasks: 'disabled' } }))).not.toContain('listTasks');
		expect(voiceToolNames(orgContext({ role: 'member', grants: { tasks: 'read' } }))).not.toContain(
			'createTask'
		);
		expect(voiceToolNames(orgContext({ role: 'member', grants: { tasks: 'read' } }))).toContain(
			'listTasks'
		);
	});
});

describe('voiceSessionConfig', () => {
	it('is opened with the spoken persona, this org and this caller', async () => {
		const config = await voiceSessionConfig({
			context: toolContext(),
			timeZone: 'America/New_York',
			userName: 'evan@example.com'
		});

		expect(config.instructions).toContain(VOICE_INSTRUCTIONS);
		expect(config.instructions).toContain('Acme Inc');
		expect(config.instructions).toContain('evan@example.com');
		expect(config.instructions).toContain('America/New_York');
	});

	it('carries the tools this caller may use, with their schemas, and no others', async () => {
		const config = await voiceSessionConfig({
			context: toolContext(orgContext({ modes: { tasks: 'disabled' } }))
		});
		const names = (config.tools ?? []).map((tool) => tool.name);

		expect(names).toContain('searchCompanies');
		expect(names).not.toContain('listTasks');
		expect(names).not.toContain('deleteTask');
		expect(config.tools?.every((tool) => tool.type === 'function' && tool.parameters)).toBe(true);
	});

	it('says how it listens and what it sounds like, and takes the voice from the environment', async () => {
		const config = await voiceSessionConfig({ context: toolContext() });
		expect(config.turnDetection).toEqual({ type: 'semantic-vad' });
		expect(config.voice).toBe('marin');

		const chosen = await voiceSessionConfig({
			context: toolContext(),
			source: { AI_REALTIME_VOICE: 'cedar' }
		});
		expect(chosen.voice).toBe('cedar');
	});
});

describe('runVoiceTool', () => {
	it('runs the tool with the caller’s own client and org', async () => {
		const context = toolContext(orgContext(), {
			data: [
				{
					id: TASK_ID,
					title: 'Call the roofer',
					details: null,
					due_at: null,
					completed_at: null,
					company_id: null,
					contact_id: null
				}
			]
		});

		const output = await runVoiceTool(context, 'listTasks', { openOnly: true });

		expect(context.mock.from).toHaveBeenCalledWith('tasks');
		expect(context.mock.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(output).toEqual({
			tasks: [
				{
					id: TASK_ID,
					title: 'Call the roofer',
					details: null,
					dueAt: null,
					completedAt: null,
					companyId: null,
					contactId: null
				}
			]
		});
	});

	it('refuses a tool this session does not have', async () => {
		// Off for the org…
		await expect(
			runVoiceTool(toolContext(orgContext({ modes: { tasks: 'disabled' } })), 'listTasks', {})
		).rejects.toMatchObject({ status: 403 });

		// …not granted to this member…
		await expect(
			runVoiceTool(
				toolContext(orgContext({ role: 'member', grants: { tasks: 'read' } })),
				'createTask',
				{ title: 'x' }
			)
		).rejects.toMatchObject({ status: 403 });

		// …held back from every call…
		await expect(
			runVoiceTool(toolContext(), 'deleteTask', { taskId: TASK_ID })
		).rejects.toMatchObject({ status: 403 });

		// …and never invented.
		await expect(runVoiceTool(toolContext(), 'dropDatabase', {})).rejects.toMatchObject({
			status: 403
		});
	});

	it('refuses arguments the named tool’s own schema will not take', async () => {
		await expect(
			runVoiceTool(toolContext(), 'listTasks', { companyId: 'not-an-id' })
		).rejects.toMatchObject({ status: 400 });
	});

	it('answers with the message when the tool itself fails, so the model can say it', async () => {
		const context = toolContext(orgContext(), { error: { message: 'connection refused' } });

		await expect(runVoiceTool(context, 'listTasks', {})).resolves.toEqual({
			error: expect.stringContaining('connection refused')
		});
	});
});
