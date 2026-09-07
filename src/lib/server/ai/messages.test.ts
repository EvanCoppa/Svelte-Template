import { TypeValidationError } from 'ai';
import { describe, expect, it } from 'vitest';
import { toUIMessage, toUIMessages } from './messages';

describe('toUIMessages', () => {
	it('turns stored rows into UIMessages, dropping a null metadata', async () => {
		const messages = await toUIMessages([
			{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }], metadata: null },
			{
				id: 'a1',
				role: 'assistant',
				parts: [
					{ type: 'step-start' },
					{
						type: 'tool-searchCompanies',
						toolCallId: 'call-1',
						state: 'output-available',
						input: { query: 'wayne' },
						output: { companies: [], total: 0 }
					},
					{ type: 'text', text: 'None.' }
				],
				metadata: { model: 'm', createdAt: 1 }
			}
		]);

		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] });
		expect(messages[1].metadata).toEqual({ model: 'm', createdAt: 1 });
		expect(messages[1].parts[1]).toMatchObject({
			type: 'tool-searchCompanies',
			state: 'output-available'
		});
	});

	it('is the empty list for a new thread, which the SDK would otherwise reject', async () => {
		await expect(toUIMessages([])).resolves.toEqual([]);
	});

	it('rejects a stored tool part that no longer matches its tool', async () => {
		await expect(
			toUIMessages([
				{
					id: 'a1',
					role: 'assistant',
					parts: [
						{
							type: 'tool-createTask',
							toolCallId: 'call-1',
							state: 'output-available',
							input: { title: 42 },
							output: {}
						}
					],
					metadata: null
				}
			])
		).rejects.toBeInstanceOf(TypeValidationError);
	});
});

describe('toUIMessage', () => {
	it('validates the message the browser posted', async () => {
		const message = await toUIMessage({
			id: 'u1',
			role: 'user',
			parts: [{ type: 'text', text: 'Hi' }],
			metadata: { createdAt: 1757155200000 }
		});
		expect(message).toMatchObject({ id: 'u1', role: 'user' });
	});

	it('refuses metadata that is not the app’s', async () => {
		await expect(
			toUIMessage({
				id: 'u1',
				role: 'user',
				parts: [{ type: 'text', text: 'Hi' }],
				metadata: { createdAt: 'yesterday' }
			})
		).rejects.toBeInstanceOf(TypeValidationError);
	});
});
