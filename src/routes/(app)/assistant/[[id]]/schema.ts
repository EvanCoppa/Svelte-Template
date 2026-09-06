import { z } from 'zod';

/**
 * The history rail's two forms. Ids are `z.guid()` rather than `z.uuid()`
 * for the reason the staff schema gives: a Postgres uuid is any 8-4-4-4-12
 * value, and the seed's fixed ids do not carry RFC 4122 version bits.
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
