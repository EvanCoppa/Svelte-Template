import { isRecordKind, type RecordKind } from '$lib/crm/records';
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
		case 'tool-listEvents':
			// An event has no page of its own; the record it is about does.
			return part.output.events.flatMap((event) => (event.about ? [event.about] : []));
		case 'tool-findRecords':
			return part.output.records.map((record) => ({
				kind: part.output.kind,
				id: record.id,
				name: record.name
			}));
		case 'tool-getRecord': {
			const { record, related, relationships } = part.output;
			if (!record) return [];
			return [
				{ kind: record.kind, id: record.id, name: record.name },
				...record.fields.flatMap((field) => (field.record ? [field.record] : [])),
				...related.flatMap((group) =>
					group.records.map((row) => ({ kind: group.kind, id: row.id, name: row.name }))
				),
				// A member is named, but has no page to open.
				...relationships.flatMap(({ other }) =>
					isRecordKind(other.kind) ? [{ kind: other.kind, id: other.id, name: other.name }] : []
				)
			];
		}
		case 'tool-updateRecord':
			return part.output.record ? [part.output.record] : [];
		case 'tool-exploreGraph':
			return part.output.nodes.flatMap((node) =>
				node.kind === 'member' ? [] : [{ kind: node.kind, id: node.recordId, name: node.name }]
			);
		// A note is not a record with a page of its own, and a deleted task no
		// longer has one to open — neither belongs in a list of things to read.
		// A relationship type is reference data, and a link's two ends were
		// found by the tools that named them.
		case 'tool-addNote':
		case 'tool-deleteTask':
		case 'tool-listRelationshipTypes':
		case 'tool-linkRecords':
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
