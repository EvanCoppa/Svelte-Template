import { describe, expect, it } from 'vitest';
import {
	createClient,
	createContact,
	deleteClient,
	deleteContact,
	getClient,
	listClients,
	updateClient,
	updateContact
} from './clients';
import { ORG_ID, supabaseMock } from './test-support';

const CLIENT_ID = '20000000-0000-0000-0000-000000000001';

describe('clients data access', () => {
	it('lists clients scoped to the org, ordered by name', async () => {
		const rows = [{ id: CLIENT_ID, name: 'Wayne' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listClients(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('clients');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('name');
	});

	it('fetches one client with its contacts, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getClient(supabase, ORG_ID, CLIENT_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith('*, client_contacts(*)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', CLIENT_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a client under the given org without touching created_by', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: CLIENT_ID } });

		await createClient(supabase, ORG_ID, { name: 'Stark', status: 'lead' });
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'Stark',
			status: 'lead',
			org_id: ORG_ID
		});
	});

	it('scopes updates to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: CLIENT_ID } });

		await updateClient(supabase, ORG_ID, CLIENT_ID, { status: 'active' });
		expect(builder.update).toHaveBeenCalledWith({ status: 'active' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', CLIENT_ID);
	});

	it('deletes scoped to org and id, selecting the row back as evidence', async () => {
		const { supabase, builder } = supabaseMock({ data: [{ id: CLIENT_ID }] });

		await deleteClient(supabase, ORG_ID, CLIENT_ID);
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', CLIENT_ID);
		expect(builder.select).toHaveBeenCalledWith('id');
	});

	it('throws when a delete matches no rows (RLS filtered it)', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(deleteClient(supabase, ORG_ID, CLIENT_ID)).rejects.toThrow(
			'Client was not deleted'
		);
	});

	it('adds contacts under the given org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: 'contact-1' } });

		await createContact(supabase, ORG_ID, { client_id: CLIENT_ID, name: 'Lucius Fox' });
		expect(from).toHaveBeenCalledWith('client_contacts');
		expect(builder.insert).toHaveBeenCalledWith({
			client_id: CLIENT_ID,
			name: 'Lucius Fox',
			org_id: ORG_ID
		});
	});

	it('updates contacts scoped to org and id', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: 'contact-1' } });

		await updateContact(supabase, ORG_ID, 'contact-1', { title: 'CTO' });
		expect(from).toHaveBeenCalledWith('client_contacts');
		expect(builder.update).toHaveBeenCalledWith({ title: 'CTO' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', 'contact-1');
	});

	it('removes contacts scoped to org and id, with evidence', async () => {
		const { supabase, builder } = supabaseMock({ data: [{ id: 'contact-1' }] });

		await deleteContact(supabase, ORG_ID, 'contact-1');
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', 'contact-1');
		expect(builder.select).toHaveBeenCalledWith('id');
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'permission denied' } });

		await expect(listClients(supabase, ORG_ID)).rejects.toThrow('permission denied');
	});
});
