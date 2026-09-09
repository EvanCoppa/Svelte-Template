import { describe, expect, it } from 'vitest';
import { loadPreferences, savePreference } from './preferences';
import { supabaseMock } from './crm/test-support';

const USER_ID = '00000000-0000-0000-0000-000000000001';

describe('loadPreferences', () => {
	it('reads only this user’s rows and folds them over the fallbacks', async () => {
		const { supabase, from, builder } = supabaseMock({
			data: [{ key: 'notes.dock', value: false }]
		});

		await expect(loadPreferences(supabase, USER_ID)).resolves.toEqual({ 'notes.dock': false });
		expect(from).toHaveBeenCalledWith('user_preferences');
		expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
	});

	it('gives a user who has never set one the defaults', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(loadPreferences(supabase, USER_ID)).resolves.toEqual({ 'notes.dock': true });
	});
});

describe('savePreference', () => {
	it('upserts the one row, keyed by user and key', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [{ key: 'notes.dock' }] });

		await savePreference(supabase, USER_ID, 'notes.dock', false);
		expect(from).toHaveBeenCalledWith('user_preferences');
		expect(builder.upsert).toHaveBeenCalledWith(
			{ user_id: USER_ID, key: 'notes.dock', value: false },
			{ onConflict: 'user_id,key' }
		);
	});

	it('reports a refused write rather than pretending it saved', async () => {
		const { supabase } = supabaseMock({ error: { message: 'permission denied' } });

		await expect(savePreference(supabase, USER_ID, 'notes.dock', true)).rejects.toThrow(
			'permission denied'
		);
	});
});
