import type { JSONValue } from 'ai';
import { z } from 'zod';

/**
 * The shared, client-safe schemas of the assistant: what a message carries
 * about itself, and what the browser posts to the stream endpoint. Imported
 * by the page (the Chat's `messageMetadataSchema`), by the endpoint (request
 * validation, `validateUIMessages`) and by the tests, so they live outside
 * `src/lib/server`.
 */

/**
 * Message-level facts, attached by the endpoint's `messageMetadata` callback
 * as a response streams and by the composer on the user's own messages.
 * Everything optional: the SDK merges the pieces as they arrive.
 */
const messageMetadataFields = z.object({
	/** Epoch milliseconds. */
	createdAt: z.number().int().optional(),
	/** The model that answered. */
	model: z.string().optional(),
	inputTokens: z.number().int().optional(),
	outputTokens: z.number().int().optional()
});

/**
 * Optional as a whole: `validateUIMessages` and the Chat check every message's
 * metadata against this, and a message may carry none (a stored assistant
 * message from before metadata was attached, a bare user message).
 */
export const messageMetadataSchema = messageMetadataFields.optional();

export type AssistantMessageMetadata = z.infer<typeof messageMetadataFields>;

/**
 * A UIMessage as it arrives in a request body. Shallow on purpose: the
 * endpoint runs the SDK's `validateUIMessages` over it, against the current
 * tools and the metadata schema, which is the check that matters.
 */
const incomingMessageSchema = z.looseObject({
	id: z.string().trim().min(1).max(200),
	role: z.enum(['system', 'user', 'assistant']),
	parts: z.array(z.unknown()),
	metadata: z.unknown().optional()
});

export type IncomingMessage = z.infer<typeof incomingMessageSchema>;

const conversationIdSchema = z.guid();

/** The caller's IANA time zone, so "today" in the instructions resolves where the user is. */
const timeZoneSchema = z.string().trim().min(1).max(64).optional();

/**
 * What the transport's `prepareSendMessagesRequest` posts — only the last
 * message, never the history (the server owns that), plus the SDK's trigger.
 *
 *   submit-message      a new user message, or the thread's own assistant
 *                       message carrying the user's answers to approval
 *                       requests
 *   regenerate-message  answer again from `messageId` (the message being
 *                       regenerated; absent means the thread's last one)
 */
export const streamRequestSchema = z.discriminatedUnion('trigger', [
	z.object({
		trigger: z.literal('submit-message'),
		id: conversationIdSchema,
		message: incomingMessageSchema,
		timeZone: timeZoneSchema
	}),
	z.object({
		trigger: z.literal('regenerate-message'),
		id: conversationIdSchema,
		messageId: z.string().trim().min(1).max(200).optional(),
		timeZone: timeZoneSchema
	})
]);

export type StreamRequest = z.infer<typeof streamRequestSchema>;

/**
 * A voice call's setup request. The SDK's realtime session posts the session
 * config it is about to send and nothing else, so the one per-request fact
 * the server needs — where the caller is, for "today" — travels in the setup
 * URL's `tz` instead. Bounded like a turn's for the same reason: it ends up
 * in the model's instructions.
 */
export const realtimeTimeZoneSchema = z.string().trim().min(1).max(64);

/**
 * JSON itself, as the one contract the tool bridge holds its arguments to —
 * checked on the way out of the browser and again on the way into the server.
 * It goes no further than the shape on purpose: a tool's arguments are the
 * model's, and only the named tool's own schema can say whether they are
 * valid for it, which is `runVoiceTool()`'s first act.
 */
export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema)
	])
);

/** What the browser relays when the model calls a tool during a call. */
export const realtimeToolRequestSchema = z.object({
	name: z.string().trim().min(1).max(100),
	input: jsonValueSchema
});
