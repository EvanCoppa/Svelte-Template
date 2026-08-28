import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt (what Supabase Auth hashes with) silently truncates at 72 *bytes*.
 * Rejecting longer input beats accepting a passphrase whose tail is never
 * actually read.
 */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Shared by /reset-password and the settings change-password form — every
 * place a new password is chosen enforces the same rules.
 */
export const newPasswordSchema = z
	.object({
		password: z
			.string()
			.min(
				PASSWORD_MIN_LENGTH,
				`Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters.`
			)
			.refine(
				(password) => new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES,
				`Password must be at most ${String(PASSWORD_MAX_BYTES)} bytes.`
			),
		confirm_password: z.string()
	})
	.refine((data) => data.password === data.confirm_password, {
		error: 'Passwords do not match.',
		path: ['confirm_password']
	});
