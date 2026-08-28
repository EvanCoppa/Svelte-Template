import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, newPasswordSchema } from './password';

function parse(password: string, confirm_password: string) {
	return newPasswordSchema.safeParse({ password, confirm_password });
}

function messagesOf(result: ReturnType<typeof parse>) {
	return result.error?.issues.map((issue) => issue.message).join(' ') ?? '';
}

describe('newPasswordSchema', () => {
	it('accepts a matching pair that meets the rules', () => {
		expect(parse('a-fine-password', 'a-fine-password').success).toBe(true);
	});

	it('rejects a password below the minimum length', () => {
		const short = 'x'.repeat(PASSWORD_MIN_LENGTH - 1);
		expect(messagesOf(parse(short, short))).toMatch(/at least/);
	});

	it('rejects a password over 72 bytes, which bcrypt would silently truncate', () => {
		// 24 four-byte emoji = 96 bytes but only 48 UTF-16 code units, so a
		// naive .length check would pass it.
		const emoji = '🔑'.repeat(24);
		expect(emoji.length).toBeLessThan(72);
		expect(messagesOf(parse(emoji, emoji))).toMatch(/72 bytes/);
	});

	it('rejects a mismatched confirmation on the confirmation field', () => {
		const result = parse('a-fine-password', 'a-fine-passw0rd');
		expect(messagesOf(result)).toMatch(/do not match/);
		expect(result.error?.issues[0]?.path).toEqual(['confirm_password']);
	});
});
