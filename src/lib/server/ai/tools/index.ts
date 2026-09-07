import type { ToolSet } from 'ai';
import type { OrgContext } from '$lib/server/org-context';
import type { AssistantToolContext } from '../context';
import { isToolActive, type ToolAccess } from './access';
import { addNote, addNoteAccess } from './add-note';
import { completeTask, completeTaskAccess } from './complete-task';
import { createTask, createTaskAccess } from './create-task';
import { deleteTask, deleteTaskAccess } from './delete-task';
import { getCompany, getCompanyAccess } from './get-company';
import { listDeals, listDealsAccess } from './list-deals';
import { listTasks, listTasksAccess } from './list-tasks';
import { listTickets, listTicketsAccess } from './list-tickets';
import { searchCompanies, searchCompaniesAccess } from './search-companies';
import { searchContacts, searchContactsAccess } from './search-contacts';

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
	listTickets
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
	listTickets: listTicketsAccess
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
 * Tools that remove data pause for the user's approval in the thread — the
 * SDK's `toolApproval` map. Everything else runs when the model calls it.
 */
export const TOOL_APPROVAL = { deleteTask: 'user-approval' } as const;

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
