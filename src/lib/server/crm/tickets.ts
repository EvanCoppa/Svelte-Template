import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { ensure, unwrap } from './unwrap';

/**
 * Data access for `support_tickets` and `ticket_comments`. Same contract as
 * clients.ts. The human-facing `number` is assigned by the database and never
 * written from here; `created_by`/`author_id` default to the caller.
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
	values: Omit<TablesInsert<'support_tickets'>, 'org_id' | 'created_by'>
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
	values: TablesUpdate<'support_tickets'>
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
	ensure(await supabase.from('support_tickets').delete().eq('org_id', orgId).eq('id', ticketId));
}

export async function addTicketComment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: { ticket_id: string; body: string; is_internal?: boolean }
): Promise<TicketComment> {
	return unwrap(
		await supabase
			.from('ticket_comments')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function deleteTicketComment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	commentId: string
): Promise<void> {
	ensure(await supabase.from('ticket_comments').delete().eq('org_id', orgId).eq('id', commentId));
}
