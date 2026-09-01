import { describe, expect, it } from 'vitest';
import {
	addTicketComment,
	createTicket,
	deleteTicket,
	deleteTicketComment,
	getTicket,
	listTickets,
	updateTicket
} from './tickets';
import { ORG_ID, supabaseMock } from './test-support';

const TICKET_ID = '70000000-0000-0000-0000-000000000001';

describe('tickets data access', () => {
	it('lists tickets for the org with their client, newest first', async () => {
		const rows = [{ id: TICKET_ID, subject: 'Broken export' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listTickets(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('support_tickets');
		expect(builder.select).toHaveBeenCalledWith('*, clients(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('applies status and assignee filters only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listTickets(supabase, ORG_ID, { status: 'open', assignedTo: 'user-1' });
		expect(builder.eq).toHaveBeenCalledWith('status', 'open');
		expect(builder.eq).toHaveBeenCalledWith('assigned_to', 'user-1');
	});

	it('fetches the full thread with comments in chronological order', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: TICKET_ID } });

		await getTicket(supabase, ORG_ID, TICKET_ID);
		expect(builder.select).toHaveBeenCalledWith('*, clients(id, name), ticket_comments(*)');
		expect(builder.order).toHaveBeenCalledWith('created_at', {
			referencedTable: 'ticket_comments',
			ascending: true
		});
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates tickets under the org; number and created_by stay server-assigned', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: TICKET_ID } });

		await createTicket(supabase, ORG_ID, { subject: 'Cannot log in', priority: 'high' });
		expect(builder.insert).toHaveBeenCalledWith({
			subject: 'Cannot log in',
			priority: 'high',
			org_id: ORG_ID
		});
	});

	it('updates a ticket scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: TICKET_ID } });

		await updateTicket(supabase, ORG_ID, TICKET_ID, { status: 'resolved' });
		expect(builder.update).toHaveBeenCalledWith({ status: 'resolved' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', TICKET_ID);
	});

	it('adds comments to the thread under the org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: 'comment-1' } });

		await addTicketComment(supabase, ORG_ID, {
			ticket_id: TICKET_ID,
			body: 'On it.',
			is_internal: true
		});
		expect(from).toHaveBeenCalledWith('ticket_comments');
		expect(builder.insert).toHaveBeenCalledWith({
			ticket_id: TICKET_ID,
			body: 'On it.',
			is_internal: true,
			org_id: ORG_ID
		});
	});

	it('deletes tickets and comments scoped to org and id', async () => {
		const { supabase, from, builder } = supabaseMock({});

		await deleteTicket(supabase, ORG_ID, TICKET_ID);
		expect(from).toHaveBeenCalledWith('support_tickets');
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', TICKET_ID);

		await deleteTicketComment(supabase, ORG_ID, 'comment-1');
		expect(from).toHaveBeenCalledWith('ticket_comments');
		expect(builder.eq).toHaveBeenCalledWith('id', 'comment-1');
	});

	it('throws the PostgREST message when a mutation fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'row violates policy' } });

		await expect(createTicket(supabase, ORG_ID, { subject: 'Nope' })).rejects.toThrow(
			'row violates policy'
		);
	});
});
