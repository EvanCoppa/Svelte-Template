/**
 * Gmail REST — the thin client the sync half talks to Google through.
 *
 * Every call takes the access token `oauth.ts` produced and answers a
 * `GmailResult`: the parsed value, or a failure whose `code` says what the
 * caller should do about it — `unauthorized` (refresh the token and retry),
 * `not_found` (a message is gone, or the history window has expired and a
 * full resync is due), `rate_limited` (back off for `retryAfterMs`) or
 * `other`. Nothing here throws on a bad answer, and nothing here knows about
 * organizations or rows; what a message means to the app is `mime.ts` and the
 * sync module's business.
 *
 * Responses are parsed with zod, loosely: fields Google may add are ignored
 * and arrays it omits when empty read as `[]`. `batchGetMessages()` speaks
 * the multipart/mixed batch endpoint by hand, since that is the one way to
 * fetch fifty messages in one round trip.
 *
 * Google's references:
 * https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
 * https://developers.google.com/workspace/gmail/api/guides/batch
 * https://developers.google.com/workspace/gmail/api/guides/push
 * https://developers.google.com/workspace/gmail/api/guides/sending
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const API_ROOT = 'https://gmail.googleapis.com/gmail/v1/users/me';
const BATCH_ENDPOINT = 'https://gmail.googleapis.com/batch/gmail/v1';
/** Google allows 100 calls per batch and recommends 50 to stay clear of its rate limits. */
export const GMAIL_BATCH_LIMIT = 50;

export type GmailFailure = {
	ok: false;
	code: 'unauthorized' | 'not_found' | 'rate_limited' | 'other';
	/** The HTTP status, or 0 when Google was never reached. */
	status: number;
	error: string;
	/** From the `Retry-After` header when Google sent one. */
	retryAfterMs: number | null;
};
export type GmailResult<T> = { ok: true; value: T } | GmailFailure;

export type GmailHeader = { name: string; value: string };
export type GmailPart = {
	partId?: string;
	mimeType: string;
	filename?: string;
	headers?: GmailHeader[];
	body?: { size: number; data?: string; attachmentId?: string };
	parts?: GmailPart[];
};
export type GmailMessage = {
	id: string;
	threadId: string;
	labelIds: string[];
	snippet: string;
	historyId: string;
	/** Milliseconds since the epoch, as a string — Google encodes int64 that way. */
	internalDate: string;
	sizeEstimate: number;
	payload?: GmailPart;
};
export type GmailHistoryMessage = { id: string; threadId: string; labelIds?: string[] };
export type GmailHistoryRecord = {
	id: string;
	messagesAdded?: { message: GmailHistoryMessage }[];
	messagesDeleted?: { message: GmailHistoryMessage }[];
	labelsAdded?: { message: GmailHistoryMessage; labelIds: string[] }[];
	labelsRemoved?: { message: GmailHistoryMessage; labelIds: string[] }[];
};
export type GmailMessageFormat = 'full' | 'metadata' | 'minimal';
export type GmailHistoryType = 'messageAdded' | 'messageDeleted' | 'labelAdded' | 'labelRemoved';

export interface GmailClient {
	getProfile(): Promise<GmailResult<{ emailAddress: string; historyId: string }>>;
	listMessages(params: {
		q?: string;
		pageToken?: string;
		maxResults?: number;
	}): Promise<GmailResult<{ ids: string[]; nextPageToken: string | null }>>;
	getMessage(id: string, format: GmailMessageFormat): Promise<GmailResult<GmailMessage>>;
	/**
	 * Up to `GMAIL_BATCH_LIMIT` ids per call via the multipart/mixed batch
	 * endpoint (`POST https://gmail.googleapis.com/batch/gmail/v1`). A 404 for
	 * one id drops it silently — it was deleted between listing and fetching;
	 * any other per-part failure fails the whole call. Messages come back in
	 * the order the ids were given.
	 */
	batchGetMessages(
		ids: readonly string[],
		format: GmailMessageFormat
	): Promise<GmailResult<GmailMessage[]>>;
	/** `not_found` here means the history window has expired and a full resync is due. */
	listHistory(params: {
		startHistoryId: string;
		pageToken?: string;
		historyTypes?: readonly GmailHistoryType[];
	}): Promise<
		GmailResult<{ history: GmailHistoryRecord[]; nextPageToken: string | null; historyId: string }>
	>;
	/** Start push notifications to a Pub/Sub topic; Google stops them after 7 days unless renewed. */
	watch(topicName: string): Promise<GmailResult<{ historyId: string; expiration: string }>>;
	stop(): Promise<GmailResult<void>>;
	/** `raw` is what `buildRawMessage()` returns; `threadId` keeps a reply in its thread. */
	sendMessage(
		raw: string,
		threadId?: string | null
	): Promise<GmailResult<{ id: string; threadId: string }>>;
}

export interface GmailClientDeps {
	/** Override the fetch used (tests). */
	fetchImpl?: typeof fetch;
}

/** Google encodes int64 fields (history ids, dates) as JSON strings; a number is tolerated too. */
const int64 = z.union([z.string(), z.number()]).transform((value) => String(value));

const headerSchema = z.object({ name: z.string(), value: z.string() });

const partSchema: z.ZodType<GmailPart> = z.object({
	partId: z.string().optional(),
	mimeType: z.string().default(''),
	filename: z.string().optional(),
	headers: z.array(headerSchema).optional(),
	body: z
		.object({
			size: z.number().default(0),
			data: z.string().optional(),
			attachmentId: z.string().optional()
		})
		.optional(),
	get parts() {
		return z.array(partSchema).optional();
	}
});

const messageSchema: z.ZodType<GmailMessage> = z.object({
	id: z.string(),
	threadId: z.string(),
	labelIds: z.array(z.string()).default([]),
	snippet: z.string().default(''),
	historyId: int64,
	internalDate: int64,
	sizeEstimate: z.number().default(0),
	payload: partSchema.optional()
});

const profileSchema = z.object({ emailAddress: z.string(), historyId: int64 });

const messageListSchema = z.object({
	messages: z.array(z.object({ id: z.string() })).default([]),
	nextPageToken: z.string().optional()
});

const historyMessageSchema = z.object({
	id: z.string(),
	threadId: z.string(),
	labelIds: z.array(z.string()).optional()
});
const historyMessagesSchema = z.array(z.object({ message: historyMessageSchema })).optional();
const historyLabelsSchema = z
	.array(z.object({ message: historyMessageSchema, labelIds: z.array(z.string()).default([]) }))
	.optional();
const historyRecordSchema: z.ZodType<GmailHistoryRecord> = z.object({
	id: int64,
	messagesAdded: historyMessagesSchema,
	messagesDeleted: historyMessagesSchema,
	labelsAdded: historyLabelsSchema,
	labelsRemoved: historyLabelsSchema
});
const historyListSchema = z.object({
	history: z.array(historyRecordSchema).default([]),
	nextPageToken: z.string().optional(),
	historyId: int64
});

const watchSchema = z.object({ historyId: int64, expiration: int64 });
const sentSchema = z.object({ id: z.string(), threadId: z.string() });

/** Google's error envelope — the message is the useful part. */
const errorSchema = z.object({ error: z.object({ message: z.string().optional() }) });

/** One HTTP exchange as it came back, before the body is understood. */
interface GmailAnswer {
	status: number;
	headers: Headers;
	body: string;
}

/** One response inside a batch, matched back to the position of the id that asked for it. */
interface BatchPart extends GmailAnswer {
	index: number;
}

interface GmailRequest {
	method: 'GET' | 'POST';
	/** Relative to `users/me`. */
	path: string;
	query?: URLSearchParams;
	/** A JSON document, already serialized. */
	body?: string;
}

function failure(
	code: GmailFailure['code'],
	status: number,
	error: string,
	retryAfterMs: number | null = null
): GmailFailure {
	return { ok: false, code, status, error, retryAfterMs };
}

/** JSON text through a schema, or `null` — a body that is not JSON is as bad as one that is wrong. */
function decode<T>(schema: z.ZodType<T>, text: string): T | null {
	try {
		const parsed = schema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

/** Milliseconds to wait, off a `Retry-After` given as seconds or as an HTTP date. */
function retryAfterMs(header: string | null): number | null {
	if (header === null) return null;
	const value = header.trim();
	if (/^\d+$/.test(value)) return Number.parseInt(value, 10) * 1000;
	const at = Date.parse(value);
	return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/** Map a non-2xx answer onto the codes the sync half branches on. */
function failureFrom(answer: GmailAnswer): GmailFailure {
	const { status, body } = answer;
	const message = decode(errorSchema, body)?.error.message ?? `Gmail answered ${status}.`;
	const retry = retryAfterMs(answer.headers.get('retry-after'));
	if (status === 401) return failure('unauthorized', status, message, retry);
	if (status === 404) return failure('not_found', status, message, retry);
	if (status === 429 || (status === 403 && /rateLimitExceeded/i.test(body))) {
		return failure('rate_limited', status, message, retry);
	}
	return failure('other', status, message, retry);
}

async function exchange(
	fetchImpl: typeof fetch,
	url: string,
	init: RequestInit
): Promise<GmailResult<GmailAnswer>> {
	try {
		const response = await fetchImpl(url, init);
		const answer = {
			status: response.status,
			headers: response.headers,
			body: await response.text()
		};
		return response.ok ? { ok: true, value: answer } : failureFrom(answer);
	} catch (cause) {
		return failure('other', 0, cause instanceof Error ? cause.message : 'Gmail unreachable.');
	}
}

function understood<T>(result: GmailResult<GmailAnswer>, schema: z.ZodType<T>): GmailResult<T> {
	if (!result.ok) return result;
	const value = decode(schema, result.value.body);
	if (value === null) {
		return failure('other', result.value.status, 'Gmail answered something unexpected.');
	}
	return { ok: true, value };
}

/**
 * The multipart/mixed body of a batch: one `application/http` part per id,
 * each holding a bare inner request line (a path, never a full URL — the
 * batch endpoint refuses those). Content-IDs number the parts so the answers,
 * which Google may reorder, map back to the ids.
 */
function batchRequestBody(
	boundary: string,
	ids: readonly string[],
	format: GmailMessageFormat
): string {
	const parts = ids.map((id, index) =>
		[
			`--${boundary}`,
			'Content-Type: application/http',
			`Content-ID: <item-${index}>`,
			'',
			`GET /gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=${format}`,
			''
		].join('\r\n')
	);
	return `${parts.join('\r\n')}\r\n--${boundary}--\r\n`;
}

/** Head and rest around the first blank line, or `null` when there is none. */
function splitAtBlankLine(text: string): [string, string] | null {
	const match = /\r?\n\r?\n/.exec(text);
	if (!match) return null;
	return [text.slice(0, match.index), text.slice(match.index + match[0].length)];
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Take a batch response apart: the boundary from its content type, then per
 * part the `Content-ID` (`<response-item-N>`), the inner status line, the
 * inner headers and the inner body. `null` when it is not a batch response at
 * all.
 */
function batchResponseParts(answer: GmailAnswer): BatchPart[] | null {
	const boundary = /boundary="?([^";]+)"?/i.exec(answer.headers.get('content-type') ?? '')?.[1];
	if (!boundary) return null;
	const parts: BatchPart[] = [];
	const chunks = answer.body.split(`--${boundary}`).slice(1);
	for (const [position, chunk] of chunks.entries()) {
		if (chunk.startsWith('--')) break;
		const outer = splitAtBlankLine(chunk.replace(/^\r?\n/, ''));
		if (outer === null) return null;
		const [partHeaders, innerMessage] = outer;
		const contentId = /content-id:\s*<response-item-(\d+)>/i.exec(partHeaders)?.[1];
		const index = contentId === undefined ? position : Number.parseInt(contentId, 10);
		const [innerHead, innerBody] = splitAtBlankLine(innerMessage) ?? [innerMessage, ''];
		const [statusLine = '', ...headerLines] = innerHead.split(/\r?\n/);
		const status = Number.parseInt(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(statusLine)?.[1] ?? '', 10);
		if (Number.isNaN(status)) return null;
		const headers = new Headers();
		for (const line of headerLines) {
			const colon = line.indexOf(':');
			const name = line.slice(0, colon).trim();
			if (colon > 0 && HEADER_NAME.test(name)) headers.set(name, line.slice(colon + 1).trim());
		}
		parts.push({ index, status, headers, body: innerBody.trim() });
	}
	return parts;
}

/** A client bound to one access token. Make a new one after every refresh. */
export function gmailClient(accessToken: string, deps: GmailClientDeps = {}): GmailClient {
	const fetchImpl = deps.fetchImpl ?? fetch;

	const call = (request: GmailRequest) => {
		const query = request.query?.toString() ?? '';
		const url = `${API_ROOT}/${request.path}${query ? `?${query}` : ''}`;
		const headers = new Headers({
			authorization: `Bearer ${accessToken}`,
			accept: 'application/json'
		});
		if (request.body !== undefined) headers.set('content-type', 'application/json');
		return exchange(fetchImpl, url, { method: request.method, headers, body: request.body });
	};

	return {
		async getProfile() {
			return understood(await call({ method: 'GET', path: 'profile' }), profileSchema);
		},

		async listMessages(params) {
			const query = new URLSearchParams();
			if (params.q) query.set('q', params.q);
			if (params.pageToken) query.set('pageToken', params.pageToken);
			if (params.maxResults !== undefined) query.set('maxResults', String(params.maxResults));
			const result = understood(
				await call({ method: 'GET', path: 'messages', query }),
				messageListSchema
			);
			if (!result.ok) return result;
			return {
				ok: true,
				value: {
					ids: result.value.messages.map((message) => message.id),
					nextPageToken: result.value.nextPageToken ?? null
				}
			};
		},

		async getMessage(id, format) {
			return understood(
				await call({
					method: 'GET',
					path: `messages/${encodeURIComponent(id)}`,
					query: new URLSearchParams({ format })
				}),
				messageSchema
			);
		},

		async batchGetMessages(ids, format) {
			if (ids.length === 0) return { ok: true, value: [] };
			if (ids.length > GMAIL_BATCH_LIMIT) {
				return failure(
					'other',
					0,
					`A batch takes at most ${GMAIL_BATCH_LIMIT} messages; got ${ids.length}.`
				);
			}
			const boundary = `batch_${randomBytes(12).toString('hex')}`;
			const headers = new Headers({
				authorization: `Bearer ${accessToken}`,
				'content-type': `multipart/mixed; boundary=${boundary}`
			});
			const result = await exchange(fetchImpl, BATCH_ENDPOINT, {
				method: 'POST',
				headers,
				body: batchRequestBody(boundary, ids, format)
			});
			if (!result.ok) return result;
			const parts = batchResponseParts(result.value);
			if (parts === null) {
				return failure('other', result.value.status, 'Gmail answered something unexpected.');
			}
			const found = new Map<number, GmailMessage>();
			for (const part of parts) {
				if (part.status === 404) continue;
				if (part.status < 200 || part.status >= 300) return failureFrom(part);
				const message = decode(messageSchema, part.body);
				if (message === null) {
					return failure('other', part.status, 'Gmail answered something unexpected.');
				}
				found.set(part.index, message);
			}
			return { ok: true, value: ids.flatMap((_, index) => found.get(index) ?? []) };
		},

		async listHistory(params) {
			const query = new URLSearchParams({ startHistoryId: params.startHistoryId });
			if (params.pageToken) query.set('pageToken', params.pageToken);
			for (const type of params.historyTypes ?? []) query.append('historyTypes', type);
			const result = understood(
				await call({ method: 'GET', path: 'history', query }),
				historyListSchema
			);
			if (!result.ok) return result;
			return {
				ok: true,
				value: {
					history: result.value.history,
					nextPageToken: result.value.nextPageToken ?? null,
					historyId: result.value.historyId
				}
			};
		},

		async watch(topicName) {
			return understood(
				await call({ method: 'POST', path: 'watch', body: JSON.stringify({ topicName }) }),
				watchSchema
			);
		},

		async stop() {
			const result = await call({ method: 'POST', path: 'stop' });
			return result.ok ? { ok: true, value: undefined } : result;
		},

		async sendMessage(raw, threadId) {
			return understood(
				await call({
					method: 'POST',
					path: 'messages/send',
					body: JSON.stringify(threadId ? { raw, threadId } : { raw })
				}),
				sentSchema
			);
		}
	};
}
