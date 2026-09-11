import { describe, expect, it } from 'vitest';
import { createAsset, deleteAsset, getAsset, listAssets, updateAsset } from './assets';
import { ORG_ID, supabaseMock } from './test-support';

const ASSET_ID = 'f1000000-0000-0000-0000-000000000001';

describe('assets data access', () => {
	it('lists the register in service first, then by name', async () => {
		const rows = [{ id: ASSET_ID, name: 'MacBook Pro' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listAssets(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('assets');
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenNthCalledWith(1, 'status');
		expect(builder.order).toHaveBeenNthCalledWith(2, 'name');
	});

	it('narrows to one status only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listAssets(supabase, ORG_ID, { status: 'retired' });
		expect(builder.eq).toHaveBeenCalledWith('status', 'retired');

		const bare = supabaseMock({ data: [] });
		await listAssets(bare.supabase, ORG_ID);
		expect(bare.builder.eq).toHaveBeenCalledTimes(1);
	});

	it('fetches one asset, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getAsset(supabase, ORG_ID, ASSET_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('id', ASSET_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates an asset in the org, leaving authorship to the database', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: ASSET_ID } });

		await createAsset(supabase, ORG_ID, {
			name: 'MacBook Pro',
			asset_type: 'device',
			identifier: 'IT-001',
			purchase_price: 2399
		});
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'MacBook Pro',
			asset_type: 'device',
			identifier: 'IT-001',
			purchase_price: 2399,
			org_id: ORG_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: ASSET_ID } });
		await updateAsset(updated.supabase, ORG_ID, ASSET_ID, { status: 'retired' });
		expect(updated.builder.update).toHaveBeenCalledWith({ status: 'retired' });
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(updated.builder.eq).toHaveBeenCalledWith('id', ASSET_ID);

		const deleted = supabaseMock({ data: [{ id: ASSET_ID }] });
		await deleteAsset(deleted.supabase, ORG_ID, ASSET_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteAsset(filtered.supabase, ORG_ID, ASSET_ID)).rejects.toThrow(
			'Asset was not deleted'
		);
	});
});
