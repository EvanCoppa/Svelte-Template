import { describe, expect, it } from 'vitest';
import type { GmailMessage } from './gmail';
import {
	buildRawMessage,
	decodeEncodedWords,
	formatAddress,
	htmlToText,
	parseAddressList,
	parseMessagePayload,
	stripSubjectPrefixes,
	type Address
} from './mime';

const b64url = (text: string, encoding: BufferEncoding = 'utf8') =>
	Buffer.from(text, encoding).toString('base64url');

describe('parseAddressList', () => {
	it('reads names, quoted names, bare addresses and lists', () => {
		expect(parseAddressList('Ada Lovelace <Ada@Example.com>')).toEqual([
			{ address: 'ada@example.com', name: 'Ada Lovelace' }
		]);
		expect(parseAddressList('"Lovelace, Ada" <ada@example.com>, bob@example.com')).toEqual([
			{ address: 'ada@example.com', name: 'Lovelace, Ada' },
			{ address: 'bob@example.com', name: null }
		]);
		expect(parseAddressList('<ada@example.com>')).toEqual([
			{ address: 'ada@example.com', name: null }
		]);
		expect(parseAddressList('"Ada \\"the first\\" L" <ada@example.com>')).toEqual([
			{ address: 'ada@example.com', name: 'Ada "the first" L' }
		]);
	});

	it('decodes RFC 2047 names in B and Q encodings, joining adjacent words', () => {
		expect(parseAddressList('=?UTF-8?B?w5xtbGF1dA==?= <u@example.com>')).toEqual([
			{ address: 'u@example.com', name: 'Ümlaut' }
		]);
		expect(parseAddressList('=?ISO-8859-1?Q?Andr=E9?= <andre@example.com>')).toEqual([
			{ address: 'andre@example.com', name: 'André' }
		]);
		expect(parseAddressList('=?UTF-8?Q?Hello?= =?UTF-8?Q?_World?= <h@example.com>')).toEqual([
			{ address: 'h@example.com', name: 'Hello World' }
		]);
		expect(decodeEncodedWords('plain =?utf-8?q?caf=C3=A9?= text')).toBe('plain café text');
	});

	it('drops comments, group labels and what is not an address', () => {
		expect(parseAddressList('ada@example.com (Ada)')).toEqual([
			{ address: 'ada@example.com', name: null }
		]);
		expect(parseAddressList('undisclosed-recipients:;')).toEqual([]);
		expect(parseAddressList('Team: ada@example.com, bob@example.com;')).toEqual([
			{ address: 'ada@example.com', name: null },
			{ address: 'bob@example.com', name: null }
		]);
		expect(parseAddressList('not an address')).toEqual([]);
		expect(parseAddressList('')).toEqual([]);
		expect(parseAddressList(null)).toEqual([]);
		expect(parseAddressList(undefined)).toEqual([]);
	});
});

describe('formatAddress', () => {
	const cases: [Address, string][] = [
		[{ address: 'a@b.com', name: null }, 'a@b.com'],
		[{ address: 'a@b.com', name: '' }, 'a@b.com'],
		[{ address: 'a@b.com', name: 'Ada Lovelace' }, 'Ada Lovelace <a@b.com>'],
		[{ address: 'a@b.com', name: 'Lovelace, Ada' }, '"Lovelace, Ada" <a@b.com>'],
		[{ address: 'a@b.com', name: 'Ada "L"' }, '"Ada \\"L\\"" <a@b.com>'],
		[{ address: 'a@b.com', name: 'Ümlaut' }, '=?UTF-8?B?w5xtbGF1dA==?= <a@b.com>']
	];

	it.each(cases)('formats %o as %s', (address, expected) => {
		expect(formatAddress(address)).toBe(expected);
	});

	it.each(cases)('round-trips %o through parseAddressList', (address) => {
		expect(parseAddressList(formatAddress(address))).toEqual([
			{ address: address.address, name: address.name || null }
		]);
	});

	it('never lets a name break the header', () => {
		expect(formatAddress({ address: 'a@b.com', name: 'Ada\r\nBcc: x@y.z' })).toBe(
			'"Ada Bcc: x@y.z" <a@b.com>'
		);
	});
});

describe('parseMessagePayload', () => {
	const message: GmailMessage = {
		id: 'm1',
		threadId: 't1',
		labelIds: ['INBOX'],
		snippet: 'Hello',
		historyId: '1',
		internalDate: '1700000000000',
		sizeEstimate: 1000,
		payload: {
			mimeType: 'multipart/mixed',
			headers: [
				{ name: 'subject', value: 'Re: =?UTF-8?Q?Caf=C3=A9?= plans' },
				{ name: 'From', value: '"Lovelace, Ada" <Ada@example.com>' },
				{ name: 'To', value: 'bob@example.com, Carol <carol@example.com>' },
				{ name: 'CC', value: 'dan@example.com' },
				{ name: 'Reply-To', value: 'ada+replies@example.com' },
				{ name: 'Message-ID', value: '<msg-1@example.com>' },
				{ name: 'In-Reply-To', value: '<msg-0@example.com>' },
				{ name: 'References', value: '<msg-a@example.com>\r\n <msg-0@example.com>' }
			],
			parts: [
				{
					mimeType: 'multipart/alternative',
					parts: [
						{
							mimeType: 'text/plain',
							headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
							body: { size: 11, data: b64url('Hello there') }
						},
						{
							mimeType: 'text/html',
							body: { size: 24, data: b64url('<p>Hello <b>there</b></p>') }
						}
					]
				},
				{
					mimeType: 'application/pdf',
					filename: 'quote.pdf',
					body: { size: 100, attachmentId: 'att-1' }
				}
			]
		}
	};

	it('reads the headers case-insensitively and the first text/plain part', () => {
		expect(parseMessagePayload(message)).toEqual({
			rfcMessageId: 'msg-1@example.com',
			inReplyTo: 'msg-0@example.com',
			references: ['msg-a@example.com', 'msg-0@example.com'],
			subject: 'Re: Café plans',
			from: { address: 'ada@example.com', name: 'Lovelace, Ada' },
			to: [
				{ address: 'bob@example.com', name: null },
				{ address: 'carol@example.com', name: 'Carol' }
			],
			cc: [{ address: 'dan@example.com', name: null }],
			bcc: [],
			replyTo: [{ address: 'ada+replies@example.com', name: null }],
			bodyText: 'Hello there',
			attachmentCount: 1
		});
	});

	it('falls back to the html part as text, and to nothing', () => {
		const htmlOnly: GmailMessage = {
			...message,
			payload: {
				mimeType: 'text/html',
				headers: [{ name: 'Subject', value: 'Hi' }],
				body: { size: 24, data: b64url('<div>Hello <b>there</b><br>again</div>') }
			}
		};
		expect(parseMessagePayload(htmlOnly)).toMatchObject({
			subject: 'Hi',
			bodyText: 'Hello there\nagain',
			attachmentCount: 0
		});
		expect(parseMessagePayload({ ...message, payload: undefined })).toEqual({
			rfcMessageId: null,
			inReplyTo: null,
			references: [],
			subject: null,
			from: null,
			to: [],
			cc: [],
			bcc: [],
			replyTo: [],
			bodyText: null,
			attachmentCount: 0
		});
	});

	it('decodes a part in the charset its header names and ignores a text attachment', () => {
		const latin: GmailMessage = {
			...message,
			payload: {
				mimeType: 'multipart/mixed',
				headers: [],
				parts: [
					{
						mimeType: 'text/plain',
						filename: 'notes.txt',
						body: { size: 5, data: b64url('an attachment') }
					},
					{
						mimeType: 'text/plain',
						headers: [{ name: 'Content-Type', value: 'text/plain; charset=ISO-8859-1' }],
						body: { size: 4, data: b64url('café', 'latin1') }
					}
				]
			}
		};
		expect(parseMessagePayload(latin)).toMatchObject({ bodyText: 'café', attachmentCount: 1 });
	});
});

describe('htmlToText', () => {
	it('keeps the words a reader would see and the breaks between them', () => {
		expect(
			htmlToText(
				'<html><head><title>T</title><style>p{color:red}</style></head><body>' +
					'<p>Hi &amp; bye</p><div>Line<br>two</div><script>x()</script>' +
					'<ul><li>a</li><li>b</li></ul>&#169; &#x41;&nbsp;&quot;q&quot;</body></html>'
			)
		).toBe('Hi & bye\n\nLine\ntwo\na\nb\n© A "q"');
	});

	it('reads Gmail-style div lines single-spaced and honours blank lines a writer made', () => {
		expect(
			htmlToText('<div dir="ltr">one<div>two</div><div><br></div><div>three</div></div>')
		).toBe('one\ntwo\n\nthree');
		expect(htmlToText('a<br><br><br><br>b')).toBe('a\n\nb');
		expect(htmlToText('  spaced\n   out   text  ')).toBe('spaced out text');
		expect(htmlToText('&lt;b&gt; stays &unknown; &#xZZ;')).toBe('<b> stays &unknown; &#xZZ;');
	});
});

describe('stripSubjectPrefixes', () => {
	it('removes every reply and forward marker, any case, with counters', () => {
		expect(stripSubjectPrefixes('Re: Hello')).toBe('Hello');
		expect(stripSubjectPrefixes('RE: FW: Fwd: re[2]: Fw : Hello')).toBe('Hello');
		expect(stripSubjectPrefixes('re:re:  Hello ')).toBe('Hello');
		expect(stripSubjectPrefixes('Hello')).toBe('Hello');
		expect(stripSubjectPrefixes('Rear window: Re: view')).toBe('Rear window: Re: view');
		expect(stripSubjectPrefixes('Re:')).toBe('');
	});
});

describe('buildRawMessage', () => {
	const input = {
		from: { address: 'ada@example.com', name: 'Ada Lovelace' },
		to: [
			{ address: 'bob@example.com', name: 'Bob' },
			{ address: 'carol@example.com', name: null }
		],
		cc: [{ address: 'dan@example.com', name: 'Dan, D' }],
		subject: 'Re: Café plans',
		text: 'Ünïcode ✓\n\nSee you there.',
		inReplyTo: '<msg-0@example.com>',
		references: ['msg-a@example.com', '<msg-0@example.com>'],
		date: new Date('2026-09-14T12:34:56Z')
	};

	/** The message a `raw` blob holds: its header lines as sent, unfolded, and its decoded body. */
	function decoded(raw: string) {
		const message = Buffer.from(raw, 'base64url').toString('utf8');
		const [head = '', ...rest] = message.split('\r\n\r\n');
		return {
			lines: head.split('\r\n'),
			head: head.replace(/\r\n /g, ' ').split('\r\n'),
			body: Buffer.from(rest.join('\r\n\r\n').replace(/\r\n/g, ''), 'base64').toString('utf8')
		};
	}

	it('writes an RFC 5322 text/plain message and hands back unpadded base64url', () => {
		const raw = buildRawMessage(input);
		expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
		const { head, body } = decoded(raw);
		expect(head).toEqual([
			'From: Ada Lovelace <ada@example.com>',
			'To: Bob <bob@example.com>, carol@example.com',
			'Cc: "Dan, D" <dan@example.com>',
			'Subject: =?UTF-8?B?UmU6IENhZsOpIHBsYW5z?=',
			'Date: Mon, 14 Sep 2026 12:34:56 +0000',
			'In-Reply-To: <msg-0@example.com>',
			'References: <msg-a@example.com> <msg-0@example.com>',
			'MIME-Version: 1.0',
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: base64'
		]);
		expect(body).toBe(input.text);
	});

	it('leaves an ASCII subject alone and the threading headers out of a fresh message', () => {
		const { head, body } = decoded(
			buildRawMessage({
				from: { address: 'ada@example.com', name: null },
				to: [{ address: 'bob@example.com', name: null }],
				subject: 'Plain\r\nBcc: x@y.z',
				text: '',
				date: new Date('2026-09-14T12:34:56Z')
			})
		);
		expect(head).toEqual([
			'From: ada@example.com',
			'To: bob@example.com',
			'Subject: Plain Bcc: x@y.z',
			'Date: Mon, 14 Sep 2026 12:34:56 +0000',
			'MIME-Version: 1.0',
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: base64'
		]);
		expect(body).toBe('');
	});

	it('folds long headers at 76 columns and wraps the body there too', () => {
		const subject = 'Ü'.repeat(60);
		const to = [
			{ address: 'bob@example.com', name: 'Bob Builder' },
			{ address: 'carol@example.com', name: 'Carol Danvers' },
			{ address: 'dan.dawson@example.com', name: 'Dan, D' },
			{ address: 'erin@example.com', name: null }
		];
		const raw = buildRawMessage({ ...input, to, subject, text: 'x'.repeat(200) });
		const { lines, head, body } = decoded(raw);
		for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
		expect(lines.length).toBeGreaterThan(head.length);
		expect(head).toContain(
			'To: Bob Builder <bob@example.com>, Carol Danvers <carol@example.com>, "Dan, D" <dan.dawson@example.com>, erin@example.com'
		);
		const subjectLine = head.find((line) => line.startsWith('Subject: ')) ?? '';
		expect(subjectLine.split(' ').length).toBeGreaterThan(2);
		expect(decodeEncodedWords(subjectLine.replace(/^Subject: /, ''))).toBe(subject);
		const message = Buffer.from(raw, 'base64url').toString('utf8');
		for (const line of message.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76);
		expect(body).toBe('x'.repeat(200));
	});
});
