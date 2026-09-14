import type { RecordKind } from '$lib/crm/records';
import { isAssistantToolPart, type AssistantToolUIPart, type AssistantUIMessage } from './types';

/**
 * What an answer drew on: the records the assistant's tools actually returned,
 * read back out of the message parts rather than tracked separately. The
 * thread already carries them — a tool part in `output-available` holds the
 * rows it found — so the panel beside the conversation is a read of the
 * conversation, and a stored thread shows the same sources on reload as it
 * did while it streamed.
 *
 * Typed against the tool set, so a tool whose output changes shape is a type
 * error here rather than a source that quietly stops appearing.
 */
export type Source = { kind: RecordKind; id: string; name: string };

/** The records one settled tool call names. */
function sourcesOfPart(part: AssistantToolUIPart): Source[] {
	if (part.state !== 'output-available') return [];

	switch (part.type) {
		case 'tool-searchCompanies':
			return part.output.companies.map((company) => ({
				kind: 'company',
				id: company.id,
				name: company.name
			}));
		case 'tool-getCompany': {
			const { company, contacts } = part.output;
			const found: Source[] = company
				? [{ kind: 'company', id: company.id, name: company.name }]
				: [];
			return found.concat(
				contacts.map((contact) => ({ kind: 'contact', id: contact.id, name: contact.name }))
			);
		}
		case 'tool-searchContacts':
			return part.output.contacts.map((contact) => ({
				kind: 'contact',
				id: contact.id,
				name: contact.name
			}));
		case 'tool-listTasks':
			return part.output.tasks.map((task) => ({ kind: 'task', id: task.id, name: task.title }));
		case 'tool-createTask':
		case 'tool-completeTask':
			return [{ kind: 'task', id: part.output.task.id, name: part.output.task.title }];
		case 'tool-listDeals':
			return part.output.deals.map((deal) => ({ kind: 'deal', id: deal.id, name: deal.title }));
		case 'tool-listTickets':
			return part.output.tickets.map((ticket) => ({
				kind: 'ticket',
				id: ticket.id,
				name: ticket.subject
			}));
		// A note is not a record with a page of its own, and a deleted task no
		// longer has one to open — neither belongs in a list of things to read.
		// Nor is an email thread: it is read on the record it is filed on.
		case 'tool-addNote':
		case 'tool-deleteTask':
		case 'tool-searchEmails':
		case 'tool-readEmailThread':
			return [];
	}
}

/**
 * Every record the thread's answers drew on, newest turn first, each named
 * once — the same row found by two tools is one source, and a record the
 * assistant kept re-reading does not fill the panel with copies of itself.
 */
export function sourcesOf(messages: AssistantUIMessage[]): Source[] {
	const seen = new Set<string>();
	const sources: Source[] = [];

	for (let index = messages.length - 1; index >= 0; index--) {
		for (const part of messages[index].parts) {
			if (!isAssistantToolPart(part)) continue;
			for (const source of sourcesOfPart(part)) {
				const key = `${source.kind}:${source.id}`;
				if (seen.has(key)) continue;
				seen.add(key);
				sources.push(source);
			}
		}
	}

	return sources;
}
