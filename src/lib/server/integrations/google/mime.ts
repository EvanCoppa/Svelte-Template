/**
 * MIME — what a Gmail message says, and how to write one Gmail will send.
 *
 * Gmail hands back a message as a tree of parts with raw RFC 5322 headers on
 * it; the sync half wants a `ParsedMessage` — who wrote to whom, the subject
 * without its `Re:`s, the text a person would read, and the ids that place it
 * in a thread. `parseMessagePayload()` is that reading, and the helpers
 * around it (`parseAddressList()`, `htmlToText()`, `stripSubjectPrefixes()`)
 * are exported for the places that meet one header on its own. Going the
 * other way, `buildRawMessage()` writes a plain-text reply as the base64url
 * blob Gmail's `raw` field takes, with the threading headers Google needs to
 * file it under the right conversation.
 *
 * Everything here is pure: no network, no clock unless a `date` is passed,
 * and nothing throws on a malformed header — an address that cannot be read
 * is left out, a body that cannot be decoded reads as `null`.
 *
 * https://developers.google.com/workspace/gmail/api/guides/sending
 */
import type { GmailHeader, GmailMessage, GmailPart } from './gmail';

/** One mailbox, as a header names it. `address` is always lower-cased. */
export type Address = { address: string; name: string | null };

/** An RFC 2047 encoded word: `=?charset?B|Q?payload?=`. */
const ENCODED_WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
/** Whitespace between two adjacent encoded words is not part of the text (RFC 2047 §6.2). */
const BETWEEN_ENCODED_WORDS = /(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?)/g;
/** Bytes an RFC 2047 encoded word may hold and stay inside its 75-character limit. */
const ENCODED_WORD_BYTES = 45;
/** RFC 5322 specials: a display name holding one has to be quoted. */
const NAME_SPECIALS = /[()<>[\]:;@\\,."]/;
const PRINTABLE_ASCII = /^[ -~]*$/;

/** Bytes of a charset into text; an unknown charset reads as UTF-8 rather than nothing. */
function decodeBytes(bytes: Uint8Array, charset: string): string {
	const label = charset.split('*')[0]?.trim() || 'utf-8';
	try {
		return new TextDecoder(label).decode(bytes);
	} catch {
		return new TextDecoder().decode(bytes);
	}
}

/** The bytes of a Q-encoded payload: `=XX` is a byte, `_` a space, the rest literal. */
function quotedPrintableBytes(text: string): Uint8Array {
	const bytes: number[] = [];
	for (const token of text.matchAll(/=([0-9A-Fa-f]{2})|([^=]+)|(=)/g)) {
		const [, hex, literal] = token;
		if (hex !== undefined) bytes.push(Number.parseInt(hex, 16));
		else bytes.push(...Buffer.from(literal ?? '=', 'latin1'));
	}
	return Uint8Array.from(bytes);
}

function decodeEncodedWord(charset: string, encoding: string, payload: string): string {
	const bytes =
		encoding.toUpperCase() === 'B'
			? Buffer.from(payload, 'base64')
			: quotedPrintableBytes(payload.replaceAll('_', ' '));
	return decodeBytes(bytes, charset);
}

/** Header text with its RFC 2047 encoded words (`=?UTF-8?B?…?=`, `?Q?`) turned back into text. */
export function decodeEncodedWords(text: string): string {
	return text
		.replace(BETWEEN_ENCODED_WORDS, '$1')
		.replace(ENCODED_WORD, (_word, charset: string, encoding: string, payload: string) =>
			decodeEncodedWord(charset, encoding, payload)
		);
}

/**
 * Non-ASCII header text as RFC 2047 encoded words, split so no word exceeds
 * 75 characters and no character is cut in half. The words are joined with
 * folding whitespace, which a decoder drops again.
 */
function encodeWords(text: string): string {
	const words: string[] = [];
	let chunk = '';
	for (const character of text) {
		if (chunk !== '' && Buffer.byteLength(chunk + character) > ENCODED_WORD_BYTES) {
			words.push(chunk);
			chunk = '';
		}
		chunk += character;
	}
	if (chunk !== '') words.push(chunk);
	return words
		.map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`)
		.join('\r\n ');
}

/** A header value with line breaks removed, so a name or a subject can never smuggle a header in. */
function singleLine(text: string): string {
	return text.replace(/[\r\n]+/g, ' ').trim();
}

/** Header text as it goes on the wire: as is when ASCII, encoded words otherwise. */
function encodeHeaderText(text: string): string {
	const line = singleLine(text);
	return PRINTABLE_ASCII.test(line) ? line : encodeWords(line);
}

/**
 * The comma-separated items of an address header, honouring quoted strings
 * (`"Last, First"`), dropping comments (`(…)`) and group labels
 * (`undisclosed-recipients:;`), and never splitting inside angle brackets.
 */
function splitAddresses(header: string): string[] {
	const items: string[] = [];
	let current = '';
	let quoted = false;
	let escaped = false;
	let comment = 0;
	let angle = false;
	for (const character of header) {
		if (escaped) {
			current += character;
			escaped = false;
			continue;
		}
		if (quoted) {
			if (character === '\\') escaped = true;
			else if (character === '"') quoted = false;
			current += character;
			continue;
		}
		if (character === '(') {
			comment += 1;
			continue;
		}
		if (character === ')' && comment > 0) {
			comment -= 1;
			continue;
		}
		if (comment > 0) continue;
		if (character === '"') {
			quoted = true;
			current += character;
			continue;
		}
		if (character === '<') angle = true;
		if (character === '>') angle = false;
		if ((character === ',' || character === ';') && !angle) {
			items.push(current);
			current = '';
			continue;
		}
		if (character === ':' && !angle && !current.includes('@')) {
			current = '';
			continue;
		}
		current += character;
	}
	items.push(current);
	return items.map((item) => item.trim()).filter((item) => item !== '');
}

/** A display name as typed: quotes and their escapes removed, encoded words decoded. */
function displayName(raw: string): string | null {
	let name = raw.trim();
	if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
		name = name.slice(1, -1).replace(/\\(.)/g, '$1');
	}
	name = decodeEncodedWords(name).replace(/\s+/g, ' ').trim();
	return name === '' ? null : name;
}

function parseAddress(item: string): Address | null {
	const bracketed = /^(.*)<([^<>]*)>\s*$/s.exec(item);
	if (bracketed) {
		const address = bracketed[2].trim();
		if (!address.includes('@')) return null;
		return { address: address.toLowerCase(), name: displayName(bracketed[1]) };
	}
	const bare = item.trim();
	if (!bare.includes('@') || /[\s"<>]/.test(bare)) return null;
	return { address: bare.toLowerCase(), name: null };
}

/**
 * Every mailbox an address header names — `Name <a@b>`, `"Last, First" <a@b>`,
 * bare `a@b`, comma-separated, RFC 2047 names decoded. What cannot be read as
 * an address is left out rather than guessed at.
 */
export function parseAddressList(header: string | null | undefined): Address[] {
	if (!header) return [];
	return splitAddresses(header).flatMap((item) => parseAddress(item) ?? []);
}

/**
 * An address the way a header wants it: bare when there is no name, `Name <a@b>`
 * when the name is plain, quoted when it holds a special, and RFC 2047-encoded
 * when it is not ASCII.
 */
export function formatAddress(a: Address): string {
	const name = singleLine(a.name ?? '');
	if (name === '') return a.address;
	if (!PRINTABLE_ASCII.test(name)) return `${encodeWords(name)} <${a.address}>`;
	if (NAME_SPECIALS.test(name)) return `"${name.replace(/(["\\])/g, '\\$1')}" <${a.address}>`;
	return `${name} <${a.address}>`;
}

function formatAddressList(list: readonly Address[]): string {
	return list.map(formatAddress).join(',\r\n ');
}

export type ParsedMessage = {
	/** The `Message-ID` header, angle brackets stripped. */
	rfcMessageId: string | null;
	inReplyTo: string | null;
	references: string[];
	subject: string | null;
	from: Address | null;
	to: Address[];
	cc: Address[];
	bcc: Address[];
	replyTo: Address[];
	/** The first `text/plain` part, else the first `text/html` part as text; `null` when there is neither. */
	bodyText: string | null;
	/** Parts carrying a filename. */
	attachmentCount: number;
};

/** The first header of that name, matched case-insensitively. */
function headerValue(headers: readonly GmailHeader[], name: string): string | null {
	return headers.find((header) => header.name.toLowerCase() === name)?.value ?? null;
}

/** Every part of a message, depth-first, the root first. */
function flattenParts(part: GmailPart | undefined): GmailPart[] {
	if (!part) return [];
	return [part, ...(part.parts ?? []).flatMap((child) => flattenParts(child))];
}

/** A part's text, decoded from Gmail's base64url in the charset its own header names. */
function partText(part: GmailPart): string | null {
	const data = part.body?.data;
	if (!data) return null;
	const contentType = headerValue(part.headers ?? [], 'content-type') ?? '';
	const charset = /charset="?([^";\s]+)"?/i.exec(contentType)?.[1] ?? 'utf-8';
	return decodeBytes(Buffer.from(data, 'base64url'), charset);
}

function stripAngles(id: string): string {
	return id.trim().replace(/^<|>$/g, '');
}

/** The message ids a header lists, brackets stripped. */
function messageIds(header: string | null): string[] {
	return (header ?? '')
		.split(/\s+/)
		.map(stripAngles)
		.filter((id) => id !== '');
}

function firstMessageId(header: string | null): string | null {
	const [first] = messageIds(header);
	return first ?? null;
}

/**
 * Read a message as fetched with `format: 'full'` (or `'metadata'` — then the
 * body is `null`). Headers are matched case-insensitively; the body is the
 * first `text/plain` part that is not an attachment, else the first
 * `text/html` one through `htmlToText()`.
 */
export function parseMessagePayload(message: GmailMessage): ParsedMessage {
	const headers = message.payload?.headers ?? [];
	const header = (name: string) => headerValue(headers, name);
	const parts = flattenParts(message.payload);
	const bodies = parts.filter((part) => !part.filename && part.body?.data);
	const plain = bodies.find((part) => part.mimeType.toLowerCase() === 'text/plain');
	const html = bodies.find((part) => part.mimeType.toLowerCase() === 'text/html');
	let bodyText: string | null = null;
	if (plain) {
		bodyText = partText(plain);
	} else if (html) {
		const markup = partText(html);
		bodyText = markup === null ? null : htmlToText(markup);
	}
	const subject = header('subject');
	return {
		rfcMessageId: firstMessageId(header('message-id')),
		inReplyTo: firstMessageId(header('in-reply-to')),
		references: messageIds(header('references')),
		subject: subject === null ? null : decodeEncodedWords(subject),
		from: parseAddressList(header('from'))[0] ?? null,
		to: parseAddressList(header('to')),
		cc: parseAddressList(header('cc')),
		bcc: parseAddressList(header('bcc')),
		replyTo: parseAddressList(header('reply-to')),
		bodyText,
		attachmentCount: parts.filter((part) => (part.filename ?? '') !== '').length
	};
}

const NAMED_ENTITIES = new Map([
	['amp', '&'],
	['lt', '<'],
	['gt', '>'],
	['quot', '"'],
	['apos', "'"],
	['nbsp', ' ']
]);

/** The common named entities and every numeric one; anything else stays as written. */
function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity: string, code: string) => {
		if (code.startsWith('#')) {
			const point = /^#x/i.test(code)
				? Number.parseInt(code.slice(2), 16)
				: Number.parseInt(code.slice(1), 10);
			return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
		}
		return NAMED_ENTITIES.get(code.toLowerCase()) ?? entity;
	});
}

/** A block boundary, before the breaks are counted: a run of these is one line break. */
const BLOCK_BREAK = '\uE000';
const BLOCK_TAG =
	/<\/?(?:div|li|tr|h[1-6]|blockquote|pre|table|ul|ol|section|article|header|footer|hr)\b[^>]*>/gi;

/**
 * The text of an HTML body, the way a reader would skim it: scripts and
 * styles gone, a line break where a `<br>` or a block ends, a blank line
 * after a paragraph, entities decoded, and never more than one blank line in
 * a row.
 */
export function htmlToText(html: string): string {
	const text = html
		.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p\s*>/gi, `${BLOCK_BREAK}\n`)
		.replace(/<p\b[^>]*>/gi, BLOCK_BREAK)
		.replace(BLOCK_TAG, BLOCK_BREAK)
		.replace(/<\/t[dh]\s*>/gi, ' ')
		.replace(/<[^>]+>/g, '');
	return decodeEntities(text)
		.replace(/[ \t]*(?:\uE000[ \t]*)+/g, '\n')
		.replace(/[ \t]*\n[ \t]*/g, '\n')
		.replace(/ {2,}/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

const SUBJECT_PREFIXES = /^\s*(?:(?:re|fwd?)\s*(?:\[\d+\])?\s*:\s*)+/i;

/** A subject without its reply and forward markers — `Re:`, `FW:`, `Fwd:`, `RE[2]:`, however many, any case. */
export function stripSubjectPrefixes(subject: string): string {
	return subject.replace(SUBJECT_PREFIXES, '').trim();
}

export interface RawMessageInput {
	from: Address;
	to: Address[];
	cc?: Address[];
	bcc?: Address[];
	subject: string;
	/** Plain text; any Unicode is fine. */
	text: string;
	/** The message replied to, brackets optional. */
	inReplyTo?: string | null;
	/** The thread so far, oldest first, brackets optional. */
	references?: readonly string[];
	/** Defaults to now. */
	date?: Date;
}

/** RFC 5322's date form: `Mon, 14 Sep 2026 12:34:56 +0000`. */
function rfc5322Date(date: Date): string {
	return date.toUTCString().replace(/GMT$/, '+0000');
}

/**
 * A plain-text message as the base64url (unpadded) blob Gmail's `raw` field
 * takes. The body travels as base64 so any Unicode survives, the subject is
 * RFC 2047-encoded when it needs to be, and `In-Reply-To` / `References` are
 * written the way Google's threading wants them. Pass the thread's own
 * `threadId` to `sendMessage()` alongside it.
 */
export function buildRawMessage(input: RawMessageInput): string {
	const lines = [`From: ${formatAddress(input.from)}`, `To: ${formatAddressList(input.to)}`];
	if (input.cc?.length) lines.push(`Cc: ${formatAddressList(input.cc)}`);
	if (input.bcc?.length) lines.push(`Bcc: ${formatAddressList(input.bcc)}`);
	lines.push(`Subject: ${encodeHeaderText(input.subject)}`);
	lines.push(`Date: ${rfc5322Date(input.date ?? new Date())}`);
	if (input.inReplyTo) lines.push(`In-Reply-To: <${stripAngles(input.inReplyTo)}>`);
	if (input.references?.length) {
		lines.push(`References: ${input.references.map((id) => `<${stripAngles(id)}>`).join('\r\n ')}`);
	}
	lines.push(
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=utf-8',
		'Content-Transfer-Encoding: base64',
		'',
		...(Buffer.from(input.text, 'utf8')
			.toString('base64')
			.match(/.{1,76}/g) ?? [])
	);
	return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}
