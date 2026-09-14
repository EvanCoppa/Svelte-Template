import { z } from 'zod';

/**
 * The two forms the assistant sidebar's row menu opens — posted to the
 * assistant page's actions, which is why they live here rather than beside
 * the route. Ids are `z.guid()` rather than `z.uuid()` for the reason the
 * staff schema gives: a Postgres uuid is any 8-4-4-4-12 value, and the seed's
 * fixed ids do not carry RFC 4122 version bits.
 */

export const renameConversationSchema = z.object({
	conversation_id: z.guid(),
	title: z
		.string()
		.trim()
		.min(1, 'Give the conversation a name.')
		.max(80, 'Keep the name under 80 characters.')
});

export const deleteConversationSchema = z.object({
	conversation_id: z.guid()
});
