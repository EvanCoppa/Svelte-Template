import { describe, expect, it } from 'vitest';
import { isActionFailure, isHttpError } from '@sveltejs/kit';
import { actions, load } from './+page.server';
import type { OrgContext } from '$lib/server/org-context';
import { ORG_ID, supabaseMock } from '$lib/server/crm/test-support';

const feature = (id: string, category = 'platform', sort = 0) => ({
	id,
	name: id,
	description: null,
	route: `/${id}`,
	icon: null,
	category,
	sort_order: sort,
	created_at: ''
});

function context(role: 'owner' | 'member'): OrgContext {
	return {
		organizations: [],
		activeOrg: {
			id: ORG_ID,
			name: 'Acme Inc',
			role,
			tierId: 'pro',
			tierName: 'Pro',
			industryId: 'general'
		},
		features: {
			clients: { feature: feature('clients', 'platform', 10), mode: 'enabled' },
			tasks: { feature: feature('tasks', 'platform', 30), mode: 'disabled' },
			tickets: { feature: feature('tickets', 'platform', 40), mode: 'enabled' },
			'best-practices': {
				feature: feature('best-practices', 'library', 20),
				mode: 'locked_visible'
			},
			secret: { feature: feature('secret'), mode: 'hidden' }
		},
		access: { role, roles: [], grants: new Map() }
	};
}

function harness(role: 'owner' | 'member', result: Parameters<typeof supabaseMock>[0] = {}) {
	const mock = supabaseMock(result);
	const locals = { org: context(role), supabase: mock.supabase };
	return {
		...mock,
		locals,
		// superValidate demands a real Request — a duck-typed mock is treated as
		// plain data instead of being parsed as a form post.
		post(enabled: string[]) {
			const body = new FormData();
			for (const id of enabled) body.append('enabled', id);
			// SAFETY: the action reads locals and request only; the rest of
			// RequestEvent is irrelevant to it.
			return {
				locals,
				request: new Request('https://app.test/settings/features', { method: 'POST', body })
			} as never;
		}
	};
}

/** A PageServerLoad is typed as possibly returning void; ours never does. */
function loaded<T>(data: T | void): T {
	if (data === undefined) throw new Error('expected load data');
	// SAFETY: the guard above rules out the void branch.
	return data as T;
}

describe('features settings load', () => {
	it('lists every non-hidden feature with its mode, enabled ones pre-checked', async () => {
		const h = harness('member');
		// SAFETY: the load reads locals.org, url and depends only.
		const data = loaded(
			await load({
				locals: h.locals,
				url: new URL('https://app.test/settings/features?feature=tasks'),
				depends: () => undefined
			} as never)
		);

		expect(data.rows.map((r: { id: string; mode: string }) => [r.id, r.mode])).toEqual([
			['clients', 'enabled'],
			['best-practices', 'locked_visible'],
			['tasks', 'disabled'],
			['tickets', 'enabled']
		]);
		expect(data.form.data.enabled).toEqual(['clients', 'tickets']);
		expect(data.canManage).toBe(false);
		expect(data.highlight).toBe('tasks');
	});
});

describe('features settings save', () => {
	it('refuses a plain member with a 403', async () => {
		const h = harness('member');
		await expect(actions.save(h.post(['clients']))).rejects.toSatisfy(
			(e) => isHttpError(e) && e.status === 403
		);
		expect(h.from).not.toHaveBeenCalled();
	});

	it('turns off what was unchecked and on what was checked, nothing else', async () => {
		const h = harness('owner', { data: null });
		// tickets unchecked (was enabled) -> disable; tasks checked (was disabled) -> enable.
		const result = await actions.save(h.post(['clients', 'tasks']));

		expect(isActionFailure(result)).toBe(false);
		expect(h.from).toHaveBeenCalledWith('organization_disabled_features');
		expect(h.builder.insert).toHaveBeenCalledWith([{ org_id: ORG_ID, feature_id: 'tickets' }]);
		expect(h.builder.delete).toHaveBeenCalled();
		expect(h.builder.in).toHaveBeenCalledWith('feature_id', ['tasks']);
	});

	it('rejects an id outside the plan with an inline message, touching nothing', async () => {
		const h = harness('owner');
		const result = await actions.save(h.post(['clients', 'best-practices']));

		expect(isActionFailure(result)).toBe(true);
		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: 'Only features on your plan can be turned on or off.' } }
		});
		expect(h.from).not.toHaveBeenCalled();
	});

	it('hands a refused write (the RLS backstop) to the form', async () => {
		const h = harness('owner', { error: { message: 'new row violates row-level security' } });
		const result = await actions.save(h.post([]));

		expect(isActionFailure(result)).toBe(true);
		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: 'new row violates row-level security' } }
		});
	});
});
