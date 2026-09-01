import { z } from 'zod';

/** The ids the org wants ON. Everything available and unlisted is turned off. */
export const featuresSchema = z.object({
	enabled: z.array(z.string()).default([])
});
