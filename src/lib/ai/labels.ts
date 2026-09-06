import type { AssistantToolName } from '$lib/server/ai/tools';

/**
 * How a tool call reads in the thread while it runs and once it is done. Keyed
 * by tool name so adding a tool without a label is a type error. Client-safe:
 * strings only, and the tool-name type is erased at build time.
 */
export const TOOL_LABELS = {
	searchClients: { running: 'Searching clients', done: 'Searched clients' },
	getClient: { running: 'Opening the client record', done: 'Read the client record' },
	addNote: { running: 'Adding a note', done: 'Added a note' },
	listTasks: { running: 'Listing tasks', done: 'Listed tasks' },
	createTask: { running: 'Creating a task', done: 'Created a task' },
	completeTask: { running: 'Updating a task', done: 'Updated a task' },
	deleteTask: { running: 'Deleting a task', done: 'Deleted a task' },
	listDeals: { running: 'Listing deals', done: 'Listed deals' },
	listTickets: { running: 'Listing tickets', done: 'Listed tickets' }
} satisfies Record<AssistantToolName, { running: string; done: string }>;

function isLabelled(name: string): name is keyof typeof TOOL_LABELS {
	return Object.hasOwn(TOOL_LABELS, name);
}

/** The label for any tool name, including one the registry no longer knows (a stored thread). */
export function toolLabel(name: string, done: boolean): string {
	if (isLabelled(name)) return done ? TOOL_LABELS[name].done : TOOL_LABELS[name].running;
	return done ? `Ran ${name}` : `Running ${name}`;
}
