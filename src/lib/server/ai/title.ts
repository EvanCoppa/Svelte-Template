import { generateText, type LanguageModel } from 'ai';

/** Titles fit the history rail; the column has no limit of its own. */
export const TITLE_MAX_LENGTH = 80;

/**
 * A short title for a thread from the message that opened it — one plain
 * `generateText` call, before the first answer streams, so the rail shows the
 * title the moment the turn ends without racing the stream. Best-effort: a
 * failure leaves the thread untitled and never touches the answer.
 */
export async function generateConversationTitle(
	model: LanguageModel,
	openingMessage: string
): Promise<string | null> {
	const excerpt = openingMessage.trim().slice(0, 2000);
	if (!excerpt) return null;

	try {
		const { text } = await generateText({
			model,
			prompt:
				'Write a title of at most six words for a chat that starts with the message below. ' +
				'Reply with the title only: no quotes, no trailing punctuation.\n\n' +
				`Message:\n${excerpt}`,
			maxOutputTokens: 40
		});
		const title = text
			.trim()
			.replace(/^["'“”]+|["'“”.]+$/g, '')
			.slice(0, TITLE_MAX_LENGTH)
			.trim();
		return title || null;
	} catch (cause) {
		console.error('[assistant] title generation failed', cause);
		return null;
	}
}
