import type { ToolSet } from 'ai';
import type { OrgContext } from '$lib/server/org-context';
import type { AssistantToolContext } from '../context';
import { isToolActive, type ToolAccess } from './access';
import { addNote, addNoteAccess } from './add-note';
import { completeTask, completeTaskAccess } from './complete-task';
import { createTask, createTaskAccess } from './create-task';
import { deleteTask, deleteTaskAccess } from './delete-task';
import { exploreGraph, exploreGraphAccess } from './explore-graph';
import { findOpenSlots, findOpenSlotsAccess } from './find-open-slots';
import { findRecords, findRecordsAccess } from './find-records';
import { getCompany, getCompanyAccess } from './get-company';
import { getRecord, getRecordAccess } from './get-record';
import { linkRecords, linkRecordsAccess } from './link-records';
import { listDeals, listDealsAccess } from './list-deals';
import { listEvents, listEventsAccess } from './list-events';
import { listRecords, listRecordsAccess } from './list-records';
import { listRelationshipTypes, listRelationshipTypesAccess } from './list-relationship-types';
import { listTasks, listTasksAccess } from './list-tasks';
import { listTickets, listTicketsAccess } from './list-tickets';
import { packableLines, packableLinesAccess } from './packable-lines';
import { searchCompanies, searchCompaniesAccess } from './search-companies';
import { searchContacts, searchContactsAccess } from './search-contacts';
import { updateRecord, updateRecordAccess } from './update-record';

/**
 * The assistant's tools, one file each: an AI SDK `tool()` — zod
 * `inputSchema` and `outputSchema`, a `contextSchema` for the request-scoped
 * client, an `execute` that calls a CRM data module — exported next to the
 * feature and level it touches. Two maps below, same keys (a test holds them
 * together): the tool set the agent is built with, and the access each tool
 * needs. Adding a tool = a new file + one line in each map.
 *
 * The agent always carries the full set, so `AssistantUIMessage` has a stable
 * type; which tools the model may call on a given request is
 * `activeToolNames()`, passed as `activeTools`.
 *
 * Two families. The first is a tool per feature (companies, contacts, tasks,
 * deals, tickets, the calendar), each with that feature's own filters. The
 * second is addressed by record KIND — `findRecords`, `getRecord`,
 * `updateRecord`, `exploreGraph`, `linkRecords` — and serves every kind with
 * a page through the generic record layer (`$lib/server/crm/records`,
 * `$lib/server/records`), the way one route serves every record page. Those
 * are offered while any kind is open to the caller and check the kind each
 * call names (`recordAccess()`), so a kind whose feature the org, its tier
 * or its industry withholds is refused inside the call, and the session
 * block names only the kinds that exist for this org.
 *
 * A third family answers with an ARTIFACT — a result the page draws as a
 * component in the thread rather than folding into the activity line:
 * `listRecords` (a list page's table), `findOpenSlots` (a pick-a-time card)
 * and `packableLines` (a packing card). Their output is the component's
 * data; `toModelOutput` hands the model a compact copy where the full one
 * would be tokens for nobody (docs/assistant.md, "Artifacts").
 */
export const assistantTools = {
	searchCompanies,
	getCompany,
	searchContacts,
	addNote,
	listTasks,
	createTask,
	completeTask,
	deleteTask,
	listDeals,
	listTickets,
	listEvents,
	findRecords,
	getRecord,
	updateRecord,
	exploreGraph,
	listRelationshipTypes,
	linkRecords,
	listRecords,
	findOpenSlots,
	packableLines
} satisfies ToolSet;

export type AssistantTools = typeof assistantTools;
export type AssistantToolName = keyof AssistantTools;

export const TOOL_ACCESS = {
	searchCompanies: searchCompaniesAccess,
	getCompany: getCompanyAccess,
	searchContacts: searchContactsAccess,
	addNote: addNoteAccess,
	listTasks: listTasksAccess,
	createTask: createTaskAccess,
	completeTask: completeTaskAccess,
	deleteTask: deleteTaskAccess,
	listDeals: listDealsAccess,
	listTickets: listTicketsAccess,
	listEvents: listEventsAccess,
	findRecords: findRecordsAccess,
	getRecord: getRecordAccess,
	updateRecord: updateRecordAccess,
	exploreGraph: exploreGraphAccess,
	listRelationshipTypes: listRelationshipTypesAccess,
	linkRecords: linkRecordsAccess,
	listRecords: listRecordsAccess,
	findOpenSlots: findOpenSlotsAccess,
	packableLines: packableLinesAccess
} satisfies Record<AssistantToolName, ToolAccess>;

export const TOOL_NAMES =
	// SAFETY: `assistantTools` is a literal with no other keys, so its keys are exactly AssistantToolName.
	Object.keys(assistantTools) as AssistantToolName[];

/**
 * The tools this request may use: the feature is enabled for the org and the
 * caller holds the level. Owners and admins hold every level, so for them
 * only the feature mode decides; a member sees exactly what their roles grant.
 */
export function activeToolNames(org: OrgContext): AssistantToolName[] {
	return TOOL_NAMES.filter((name) => isToolActive(org, TOOL_ACCESS[name]));
}

/**
 * Tools that pause for the user's approval in the thread — the SDK's
 * `toolApproval` map. A delete, because it removes data; an edit of a
 * record, because the card can show the change field by field before it
 * lands (`Assistant.Diff`), which is what makes a writing assistant one a
 * reader trusts. Everything else runs when the model calls it.
 */
export const TOOL_APPROVAL = {
	deleteTask: 'user-approval',
	updateRecord: 'user-approval'
} as const;

/**
 * Tools whose result is a card the reader works in — a table to filter, free
 * time to pick from, lines to tick into a box — rather than something to be
 * told (docs/assistant.md, "Artifacts"). The typed thread draws them; a voice
 * call, which has no cards, is not offered them (`voiceToolNames()`).
 */
export const CARD_TOOLS = ['listRecords', 'findOpenSlots', 'packableLines'] as const;

/** One request context for every tool; the SDK wants the map keyed by tool name. */
export function toolsContextFor(
	context: AssistantToolContext
): Record<AssistantToolName, AssistantToolContext> {
	// SAFETY: built from TOOL_NAMES, so every AssistantToolName is a key and every value is the context.
	return Object.fromEntries(TOOL_NAMES.map((name) => [name, context])) as Record<
		AssistantToolName,
		AssistantToolContext
	>;
}
