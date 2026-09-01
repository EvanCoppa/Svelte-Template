import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `support_tickets` and `ticket_comments`. Same contract as
 * clients.ts. The human-facing `number` is assigned by the database and never
 * written from here; `created_by`/`author_id` default to the caller. A
 * ticket's status is update-only — new tickets always open as 'open'.
 */

export type Ticket = Tables<'support_tickets'>;
export type TicketComment = Tables<'ticket_comments'>;
export type TicketStatus = Enums<'ticket_status'>;

/** A ticket with the client it concerns, for list screens. */
export type TicketWithClient = Ticket & {
	clients: Pick<Tables<'clients'>, 'id' | 'name'> | null;
};

/** A full ticket thread, for detail screens. */
export type TicketThread = TicketWithClient & { ticket_comments: TicketComment[] };

type TicketInsertColumn = 'client_id' | 'subject' | 'description' | 'priority' | 'assigned_to';
type TicketUpdateColumn = TicketInsertColumn | 'status';
type CommentColumn = 'body' | 'is_internal';

export async function listTickets(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { status?: TicketStatus; clientId?: string; assignedTo?: string } = {}
): Promise<TicketWithClient[]> {
	let query = supabase
		.from('support_tickets')
		.select('*, clients(id, name)')
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.status) query = query.eq('status', filter.status);
	if (filter.clientId) query = query.eq('client_id', filter.clientId);
	if (filter.assignedTo) query = query.eq('assigned_to', filter.assignedTo);
	return unwrap(await query);
}

export async function getTicket(
	supabase: SupabaseClient<Database>,
	orgId: string,
	ticketId: string
): Promise<TicketThread | null> {
	return unwrap(
		await supabase
			.from('support_tickets')
			.select('*, clients(id, name), ticket_comments(*)')
			.eq('org_id', orgId)
			.eq('id', ticketId)
			.order('created_at', { referencedTable: 'ticket_comments', ascending: true })
			.maybeSingle()
	);
}

export async function createTicket(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'support_tickets'>, TicketInsertColumn>
): Promise<Ticket> {
	return unwrap(
		await supabase
			.from('support_tickets')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateTicket(
	supabase: SupabaseClient<Database>,
	orgId: string,
	ticketId: string,
	values: Pick<TablesUpdate<'support_tickets'>, TicketUpdateColumn>
): Promise<Ticket> {
	return unwrap(
		await supabase
			.from('support_tickets')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', ticketId)
			.select()
			.single()
	);
}

export async function deleteTicket(
	supabase: SupabaseClient<Database>,
	orgId: string,
	ticketId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('support_tickets')
			.delete()
			.eq('org_id', orgId)
			.eq('id', ticketId)
			.select('id'),
		'Ticket'
	);
}

export async function addTicketComment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'ticket_comments'>, 'ticket_id' | CommentColumn>
): Promise<TicketComment> {
	return unwrap(
		await supabase
			.from('ticket_comments')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateTicketComment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	commentId: string,
	values: Pick<TablesUpdate<'ticket_comments'>, CommentColumn>
): Promise<TicketComment> {
	return unwrap(
		await supabase
			.from('ticket_comments')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', commentId)
			.select()
			.single()
	);
}

export async function deleteTicketComment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	commentId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('ticket_comments')
			.delete()
			.eq('org_id', orgId)
			.eq('id', commentId)
			.select('id'),
		'Comment'
	);
}
