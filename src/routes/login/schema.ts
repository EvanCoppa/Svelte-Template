import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');

export const loginSchema = z.object({
	email,
	password: z.string().min(1, 'Enter your password.'),
	// Round-trips the ?next= destination through the login POST. Untrusted —
	// the action allows only internal paths before redirecting.
	next: z.string().default('/')
});

export const resetSchema = z.object({ email });
