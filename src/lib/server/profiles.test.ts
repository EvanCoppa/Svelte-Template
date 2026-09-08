import { describe, expect, it } from 'vitest';
import { supabaseMock } from './crm/test-support';
import { getDisplayNames } from './profiles';

describe('getDisplayNames', () => {
	it('names each id once, preferring the display name and falling back to the email', async () => {
		const { supabase, from, builder } = supabaseMock({
			data: [
				{ id: 'u1', display_name: 'Dev User', email: 'dev@example.com' },
				{ id: 'u2', display_name: null, email: 'e2e@example.com' },
				{ id: 'u3', display_name: null, email: null }
			]
		});

		const names = await getDisplayNames(supabase, ['u1', 'u2', 'u1', 'u3']);
		expect(from).toHaveBeenCalledWith('profiles');
		expect(builder.select).toHaveBeenCalledWith('id, display_name, email');
		// Deduplicated before it reaches the query.
		expect(builder.in).toHaveBeenCalledWith('id', ['u1', 'u2', 'u3']);
		expect(names.get('u1')).toBe('Dev User');
		expect(names.get('u2')).toBe('e2e@example.com');
		// A profile with nothing to show is left out, so the caller's placeholder applies.
		expect(names.has('u3')).toBe(false);
	});

	it('asks nothing when there is nobody to name', async () => {
		const { supabase, from } = supabaseMock({ data: [] });

		await expect(getDisplayNames(supabase, [])).resolves.toEqual(new Map());
		expect(from).not.toHaveBeenCalled();
	});

	it('throws the PostgREST message when the query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(getDisplayNames(supabase, ['u1'])).rejects.toThrow('boom');
	});
});
