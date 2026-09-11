import { describe, expect, it } from 'vitest';
import { isActionFailure, isHttpError } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import { actions, load } from './+page.server';
import { ORG_ID, supabaseTablesMock } from '$lib/server/crm/test-support';

/**
 * What this route decides before any write happens: that the caller is a
 * platform operator, that the organization in the URL exists, and that the
 * plan asked for is a real one. The write itself goes through the
 * service-role client, so it is tested where its client is injectable —
 * `setOrganizationTier` in `src/lib/server/admin/organizations.test.ts` —
 * which is why nothing below ever reaches it.
 */

const OPERATOR_ID = '00000000-0000-0000-0000-000000000003';
// SAFETY: the route reads `id` and `email` only.
const USER: User = { id: OPERATOR_ID, email: 'operator@example.test' } as never;

const TIERS = [
	{ id: 'free', name: 'Free', organizations: [{ count: 7 }], tier_features: [{ count: 17 }] },
	{ id: 'pro', name: 'Pro', organizations: [{ count: 6 }], tier_features: [{ count: 20 }] }
];

function organization() {
	return {
		id: ORG_ID,
		name: 'Acme Inc',
		created_at: '2026-01-02T03:04:05Z',
		tier_id: 'free',
		industry_id: 'crm',
		tiers: { name: 'Free' },
		industries: { name: 'CRM' },
		organization_members: [{ count: 1 }],
		organization_feature_overrides: [],
		organization_disabled_features: []
	};
}

type OrgRow = ReturnType<typeof organization>;

function harness({
	operator = true,
	org = organization()
}: { operator?: boolean; org?: OrgRow | null } = {}) {
	const mock = supabaseTablesMock({
		system_admins: { data: operator ? { user_id: OPERATOR_ID } : null },
		organizations: { data: org },
		organization_members: { data: [] },
		tiers: { data: TIERS }
	});
	const locals = { supabase: mock.supabase, user: USER };

	return {
		...mock,
		// SAFETY: the load reads locals, params and depends only.
		loadEvent: { locals, params: { id: ORG_ID }, depends: () => undefined } as never,
		// superValidate demands a real Request — a duck-typed mock is treated
		// as plain data instead of being parsed as a form post.
		post(tierId: string) {
			const body = new FormData();
			body.set('tierId', tierId);
			// SAFETY: the action reads locals, params and request only.
			return {
				locals,
				params: { id: ORG_ID },
				request: new Request(`https://app.test/admin/organizations/${ORG_ID}`, {
					method: 'POST',
					body
				})
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

function setTier(event: never) {
	const action = actions['setTier'];
	if (!action) throw new Error('the organization page has no setTier action');
	return action(event);
}

describe('load', () => {
	it('names the page after the organization and offers every plan', async () => {
		const h = harness();

		const data = loaded(await load(h.loadEvent));

		expect(data.title).toBe('Acme Inc');
		expect(data.organization).toMatchObject({ id: ORG_ID, tierName: 'Free', memberCount: 1 });
		expect(data.tiers.map((tier: { id: string }) => tier.id)).toEqual(['free', 'pro']);
		// The picker starts on the plan the organization is already on, so
		// there is nothing to save until it is moved off it.
		expect(data.form.data.tierId).toBe('free');
	});

	it('refuses a signed-in user who is not an operator', async () => {
		const h = harness({ operator: false });

		await expect(load(h.loadEvent)).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
	});

	it('is a plain 404 for an id that names no organization', async () => {
		const h = harness({ org: null });

		await expect(load(h.loadEvent)).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
	});
});

describe('setTier', () => {
	it('refuses a non-operator before looking at the form at all', async () => {
		// An action is reached by POST with no load in front of it, so the
		// layout's check protects nothing here.
		const h = harness({ operator: false });

		await expect(setTier(h.post('pro'))).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
		expect(h.from).not.toHaveBeenCalledWith('organizations');
	});

	it('fails validation when no plan was picked', async () => {
		const h = harness();

		const result = await setTier(h.post(''));

		expect(isActionFailure(result) && result.status).toBe(400);
	});

	it('refuses a tier id that is not a plan on this platform', async () => {
		const h = harness();

		const result = await setTier(h.post('platinum'));

		expect(isActionFailure(result)).toBe(true);
		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: 'That is not a plan on this platform.' } }
		});
	});

	it('is a 404 when the target organization has gone', async () => {
		const h = harness({ org: null });

		await expect(setTier(h.post('pro'))).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
	});
});
