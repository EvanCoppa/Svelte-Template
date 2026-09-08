import { z } from 'zod';

export const profileSchema = z.object({
	display_name: z
		.string()
		.trim()
		.max(100, 'Display name must be 100 characters or fewer.')
		.default('')
});
