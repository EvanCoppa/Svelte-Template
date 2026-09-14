import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Sealing a mailbox's OAuth tokens before they land in `mailbox_credentials`.
 *
 * The refresh token IS the mailbox: whoever holds it reads the account until
 * it is revoked. The table has no policies and no grants, so the database
 * alone keeps it from the browser; sealing it here means a database dump, a
 * backup or a misconfigured role still holds nothing usable without
 * `MAILBOX_TOKEN_KEY`, which lives only in the deployment's environment.
 *
 * AES-256-GCM under one 32-byte key (base64 in the env var), a fresh
 * 12-byte nonce per seal, the tag carried with the ciphertext. The output is
 * versioned (`v1:`) and `mailbox_credentials.key_version` records which key
 * sealed each row, so a key can be rotated row by row rather than all at
 * once. `openSecret()` never throws: a tampered or foreign value opens to
 * null, and the caller treats that as a mailbox that needs reconnecting.
 */

export interface TokenEnv {
	MAILBOX_TOKEN_KEY?: string | undefined;
	[key: string]: string | undefined;
}

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const VERSION = 'v1';

/** The sealing key, or null (loudly) when it is unset or the wrong size. */
export function tokenKey(source: TokenEnv = env): Buffer | null {
	const encoded = (source.MAILBOX_TOKEN_KEY ?? '').trim();
	if (!encoded) return null;
	const key = Buffer.from(encoded, 'base64');
	if (key.length !== KEY_BYTES) {
		console.error(
			`[mail-sync] MAILBOX_TOKEN_KEY must be ${KEY_BYTES} bytes, base64-encoded — ` +
				`got ${key.length}. Generate one with: openssl rand -base64 32`
		);
		return null;
	}
	return key;
}

export function sealSecret(plain: string, key: Buffer): string {
	const nonce = randomBytes(NONCE_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key, nonce);
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [VERSION, encode(nonce), encode(tag), encode(ciphertext)].join(':');
}

export function openSecret(sealed: string, key: Buffer): string | null {
	const parts = sealed.split(':');
	if (parts.length !== 4 || parts[0] !== VERSION) return null;
	const [, nonce, tag, ciphertext] = parts.map(decode);
	if (nonce.length !== NONCE_BYTES || tag.length !== 16) return null;
	try {
		const decipher = createDecipheriv('aes-256-gcm', key, nonce);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	} catch {
		// A wrong key or a changed byte fails the tag check; both read as "no token".
		return null;
	}
}

function encode(bytes: Buffer): string {
	return bytes.toString('base64url');
}

function decode(text: string): Buffer {
	return Buffer.from(text, 'base64url');
}
