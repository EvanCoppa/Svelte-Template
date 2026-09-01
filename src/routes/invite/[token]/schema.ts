import { z } from 'zod';

/**
 * Accepting carries no fields — the token is in the URL and everything else
 * is derived server-side. It still goes through superforms so the accept
 * button follows the same road as every other mutation in the app.
 */
export const acceptInviteSchema = z.object({});
