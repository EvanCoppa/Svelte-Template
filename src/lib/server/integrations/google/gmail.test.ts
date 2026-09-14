import { describe, expect, it, vi } from 'vitest';
import { GMAIL_BATCH_LIMIT, gmailClient, type GmailMessage } from './gmail';

const TOKEN = 'access-1';

function fetchAnswering(status: number, body: string | null, headers: Record<string, string> = {}) {
	return vi.fn<typeof fetch>(async () => new Response(body, { status, headers }));
}

/** The one request a stub saw: its URL and the request init. */
function requested(fetchSpy: ReturnType<typeof fetchAnswering>) {
	const [input, init] = fetchSpy.mock.calls[0] ?? [];
	return { url: String(input), init, headers: new Headers(init?.headers) };
}

const messageJson = {
	id: 'm1',
	threadId: 't1',
	labelIds: ['INBOX'],
	snippet: 'Hi',
	historyId: '123',
	internalDate: '1700000000000',
	sizeEstimate: 42,
	payload: {
		partId: '',
		mimeType: 'text/plain',
		filename: '',
		headers: [{ name: 'Subject', value: 'Hi' }],
		body: { size: 2, data: 'SGk' }
	},
	unknownField: true
};

const message: GmailMessage = {
	id: 'm1',
	threadId: 't1',
	labelIds: ['INBOX'],
	snippet: 'Hi',
	historyId: '123',
	internalDate: '1700000000000',
	sizeEstimate: 42,
	payload: {
		partId: '',
		mimeType: 'text/plain',
		filename: '',
		headers: [{ name: 'Subject', value: 'Hi' }],
		body: { size: 2, data: 'SGk' }
	}
};

/** A batch answer the way Google frames one, with its own boundary. */
function batchAnswer(parts: { index: number; status: number; body: string }[]): Response {
	const boundary = 'batch_google_reply';
	const text = parts
		.map((part) =>
			[
				`--${boundary}`,
				'Content-Type: application/http',
				`Content-ID: <response-item-${part.index}>`,
				'',
				`HTTP/1.1 ${part.status} ${part.status === 200 ? 'OK' : 'Whatever'}`,
				'Content-Type: application/json; charset=UTF-8',
				'Vary: Origin',
				'',
				part.body,
				''
			].join('\r\n')
		)
		.join('');
	return new Response(`${text}--${boundary}--\r\n`, {
		status: 200,
		headers: { 'content-type': `multipart/mixed; boundary=${boundary}` }
	});
}

describe('gmailClient', () => {
	it('sends the bearer token and reads the profile, an int64 as a string', async () => {
		const fetchSpy = fetchAnswering(
			200,
			'{"emailAddress":"ada@example.com","messagesTotal":10,"historyId":9876543210}'
		);
		const result = await gmailClient(TOKEN, { fetchImpl: fetchSpy }).getProfile();
		expect(result).toEqual({
			ok: true,
			value: { emailAddress: 'ada@example.com', historyId: '9876543210' }
		});
		const { url, init, headers } = requested(fetchSpy);
		expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/profile');
		expect(init?.method).toBe('GET');
		expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
	});

	it('lists message ids with the query and reads an empty page as no ids', async () => {
		const fetchSpy = fetchAnswering(
			200,
			'{"messages":[{"id":"m1","threadId":"t1"},{"id":"m2","threadId":"t1"}],"nextPageToken":"p2","resultSizeEstimate":2}'
		);
		const client = gmailClient(TOKEN, { fetchImpl: fetchSpy });
		await expect(
			client.listMessages({ q: 'in:inbox newer_than:1d', maxResults: 2 })
		).resolves.toEqual({
			ok: true,
			value: { ids: ['m1', 'm2'], nextPageToken: 'p2' }
		});
		expect(requested(fetchSpy).url).toBe(
			'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox+newer_than%3A1d&maxResults=2'
		);
		await expect(
			gmailClient(TOKEN, {
				fetchImpl: fetchAnswering(200, '{"resultSizeEstimate":0}')
			}).listMessages({
				pageToken: 'p2'
			})
		).resolves.toEqual({ ok: true, value: { ids: [], nextPageToken: null } });
	});

	it('gets one message in the asked-for format, dropping fields it does not know', async () => {
		const fetchSpy = fetchAnswering(200, JSON.stringify(messageJson));
		await expect(
			gmailClient(TOKEN, { fetchImpl: fetchSpy }).getMessage('m1', 'full')
		).resolves.toEqual({
			ok: true,
			value: message
		});
		expect(requested(fetchSpy).url).toBe(
			'https://gmail.googleapis.com/gmail/v1/users/me/messages/m1?format=full'
		);
	});

	it('maps every failure onto a code the sync can branch on', async () => {
		const get = (status: number, body: string, headers?: Record<string, string>) =>
			gmailClient(TOKEN, { fetchImpl: fetchAnswering(status, body, headers) }).getMessage(
				'm1',
				'full'
			);

		await expect(
			get(401, '{"error":{"code":401,"message":"Invalid Credentials"}}')
		).resolves.toEqual({
			ok: false,
			code: 'unauthorized',
			status: 401,
			error: 'Invalid Credentials',
			retryAfterMs: null
		});
		await expect(
			get(404, '{"error":{"message":"Requested entity was not found."}}')
		).resolves.toMatchObject({
			ok: false,
			code: 'not_found',
			status: 404
		});
		await expect(
			get(429, '{"error":{"message":"Too many"}}', { 'retry-after': '7' })
		).resolves.toEqual({
			ok: false,
			code: 'rate_limited',
			status: 429,
			error: 'Too many',
			retryAfterMs: 7000
		});
		await expect(
			get(
				403,
				'{"error":{"errors":[{"reason":"userRateLimitExceeded"}],"message":"User-rate limit exceeded."}}'
			)
		).resolves.toMatchObject({ code: 'rate_limited', status: 403, retryAfterMs: null });
		await expect(
			get(403, '{"error":{"message":"Insufficient Permission"}}')
		).resolves.toMatchObject({
			code: 'other',
			status: 403,
			error: 'Insufficient Permission'
		});
		await expect(get(500, '<html>oops</html>')).resolves.toEqual({
			ok: false,
			code: 'other',
			status: 500,
			error: 'Gmail answered 500.',
			retryAfterMs: null
		});
		await expect(get(200, '{"id":"m1"}')).resolves.toEqual({
			ok: false,
			code: 'other',
			status: 200,
			error: 'Gmail answered something unexpected.',
			retryAfterMs: null
		});
	});

	it('reports a network failure without throwing', async () => {
		const down = vi.fn<typeof fetch>(async () => {
			throw new Error('ECONNREFUSED');
		});
		await expect(gmailClient(TOKEN, { fetchImpl: down }).getProfile()).resolves.toEqual({
			ok: false,
			code: 'other',
			status: 0,
			error: 'ECONNREFUSED',
			retryAfterMs: null
		});
	});

	describe('batchGetMessages', () => {
		it('posts one multipart request and returns the messages in id order, dropping a 404', async () => {
			const fetchSpy = vi.fn<typeof fetch>(async () =>
				batchAnswer([
					{ index: 2, status: 200, body: JSON.stringify({ ...messageJson, id: 'm3' }) },
					{ index: 1, status: 404, body: '{"error":{"code":404,"message":"Not Found"}}' },
					{ index: 0, status: 200, body: JSON.stringify(messageJson) }
				])
			);

			const result = await gmailClient(TOKEN, { fetchImpl: fetchSpy }).batchGetMessages(
				['m1', 'm2', 'm3'],
				'metadata'
			);

			expect(result).toEqual({ ok: true, value: [message, { ...message, id: 'm3' }] });
			const { url, init, headers } = requested(fetchSpy);
			expect(url).toBe('https://gmail.googleapis.com/batch/gmail/v1');
			expect(init?.method).toBe('POST');
			expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
			const boundary = /^multipart\/mixed; boundary=(batch_[0-9a-f]+)$/.exec(
				headers.get('content-type') ?? ''
			)?.[1];
			expect(boundary).toBeDefined();
			const body = String(init?.body);
			expect(body).toBe(
				[
					`--${boundary}`,
					'Content-Type: application/http',
					'Content-ID: <item-0>',
					'',
					'GET /gmail/v1/users/me/messages/m1?format=metadata',
					'',
					`--${boundary}`,
					'Content-Type: application/http',
					'Content-ID: <item-1>',
					'',
					'GET /gmail/v1/users/me/messages/m2?format=metadata',
					'',
					`--${boundary}`,
					'Content-Type: application/http',
					'Content-ID: <item-2>',
					'',
					'GET /gmail/v1/users/me/messages/m3?format=metadata',
					'',
					`--${boundary}--`,
					''
				].join('\r\n')
			);
		});

		it("fails the whole call on any other per-part failure, with that part's code", async () => {
			const fetchSpy = vi.fn<typeof fetch>(async () =>
				batchAnswer([
					{ index: 0, status: 200, body: JSON.stringify(messageJson) },
					{ index: 1, status: 429, body: '{"error":{"message":"Slow down"}}' }
				])
			);
			await expect(
				gmailClient(TOKEN, { fetchImpl: fetchSpy }).batchGetMessages(['m1', 'm2'], 'full')
			).resolves.toEqual({
				ok: false,
				code: 'rate_limited',
				status: 429,
				error: 'Slow down',
				retryAfterMs: null
			});
		});

		it('fails on an outer error, an answer that is not multipart, and a part that is not a message', async () => {
			const client = (fetchImpl: typeof fetch) => gmailClient(TOKEN, { fetchImpl });
			await expect(
				client(fetchAnswering(401, '{"error":{"message":"Invalid Credentials"}}')).batchGetMessages(
					['m1'],
					'full'
				)
			).resolves.toMatchObject({ ok: false, code: 'unauthorized' });
			await expect(
				client(
					fetchAnswering(200, '{"id":"m1"}', { 'content-type': 'application/json' })
				).batchGetMessages(['m1'], 'full')
			).resolves.toMatchObject({ ok: false, code: 'other', status: 200 });
			await expect(
				client(async () =>
					batchAnswer([{ index: 0, status: 200, body: '{"nope":1}' }])
				).batchGetMessages(['m1'], 'full')
			).resolves.toMatchObject({ ok: false, code: 'other' });
		});

		it('answers nothing for no ids without a request, and refuses more than the limit', async () => {
			const fetchSpy = fetchAnswering(200, '');
			const client = gmailClient(TOKEN, { fetchImpl: fetchSpy });
			await expect(client.batchGetMessages([], 'full')).resolves.toEqual({ ok: true, value: [] });
			const tooMany = Array.from({ length: GMAIL_BATCH_LIMIT + 1 }, (_, i) => `m${i}`);
			await expect(client.batchGetMessages(tooMany, 'full')).resolves.toMatchObject({
				ok: false,
				code: 'other',
				status: 0,
				error: expect.stringContaining(`${GMAIL_BATCH_LIMIT}`)
			});
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	});

	describe('listHistory', () => {
		it('asks for the history types wanted and reads the records', async () => {
			const fetchSpy = fetchAnswering(
				200,
				JSON.stringify({
					history: [
						{
							id: '124',
							messages: [{ id: 'm2', threadId: 't1' }],
							messagesAdded: [{ message: { id: 'm2', threadId: 't1', labelIds: ['INBOX'] } }],
							labelsRemoved: [{ message: { id: 'm1', threadId: 't1' }, labelIds: ['UNREAD'] }]
						}
					],
					nextPageToken: 'h2',
					historyId: '130'
				})
			);
			const result = await gmailClient(TOKEN, { fetchImpl: fetchSpy }).listHistory({
				startHistoryId: '123',
				historyTypes: ['messageAdded', 'labelRemoved']
			});
			expect(result).toEqual({
				ok: true,
				value: {
					history: [
						{
							id: '124',
							messagesAdded: [{ message: { id: 'm2', threadId: 't1', labelIds: ['INBOX'] } }],
							labelsRemoved: [{ message: { id: 'm1', threadId: 't1' }, labelIds: ['UNREAD'] }]
						}
					],
					nextPageToken: 'h2',
					historyId: '130'
				}
			});
			expect(requested(fetchSpy).url).toBe(
				'https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=123&historyTypes=messageAdded&historyTypes=labelRemoved'
			);
		});

		it('reads no changes as an empty list and an expired window as not_found', async () => {
			await expect(
				gmailClient(TOKEN, { fetchImpl: fetchAnswering(200, '{"historyId":"130"}') }).listHistory({
					startHistoryId: '130'
				})
			).resolves.toEqual({
				ok: true,
				value: { history: [], nextPageToken: null, historyId: '130' }
			});
			await expect(
				gmailClient(TOKEN, {
					fetchImpl: fetchAnswering(404, '{"error":{"message":"Requested entity was not found."}}')
				}).listHistory({ startHistoryId: '1' })
			).resolves.toMatchObject({ ok: false, code: 'not_found', status: 404 });
		});
	});

	it('starts and stops push notifications', async () => {
		const fetchSpy = fetchAnswering(200, '{"historyId":"1234","expiration":"1431990098200"}');
		await expect(
			gmailClient(TOKEN, { fetchImpl: fetchSpy }).watch('projects/p/topics/gmail')
		).resolves.toEqual({ ok: true, value: { historyId: '1234', expiration: '1431990098200' } });
		const { url, init, headers } = requested(fetchSpy);
		expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/watch');
		expect(init?.method).toBe('POST');
		expect(headers.get('content-type')).toBe('application/json');
		expect(JSON.parse(String(init?.body))).toEqual({ topicName: 'projects/p/topics/gmail' });

		const stopSpy = fetchAnswering(204, null);
		await expect(gmailClient(TOKEN, { fetchImpl: stopSpy }).stop()).resolves.toEqual({
			ok: true,
			value: undefined
		});
		expect(requested(stopSpy).url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/stop');
	});

	it('sends a raw message, in a thread when one is named', async () => {
		const fetchSpy = fetchAnswering(200, '{"id":"m9","threadId":"t1","labelIds":["SENT"]}');
		const client = gmailClient(TOKEN, { fetchImpl: fetchSpy });
		await expect(client.sendMessage('cmF3', 't1')).resolves.toEqual({
			ok: true,
			value: { id: 'm9', threadId: 't1' }
		});
		const { url, init } = requested(fetchSpy);
		expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
		expect(JSON.parse(String(init?.body))).toEqual({ raw: 'cmF3', threadId: 't1' });

		await client.sendMessage('cmF3', null);
		expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({ raw: 'cmF3' });
	});
});
