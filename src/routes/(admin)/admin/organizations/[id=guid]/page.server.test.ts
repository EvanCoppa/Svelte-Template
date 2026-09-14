import { describe, expect, it } from 'vitest';
import { isActionFailure, isHttpError } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import { actions, load } from './+page.server';
import { ORG_ID, supabaseTablesMock } from '$lib/server/crm/test-support';

/**
 * What this route decides before any write happens: that the caller is a
 * platform operator, that the organization in the URL exists, and that the
 * plan, vertical or feature asked for is a real one.
 *
 * Most of the writes then go through the service-role client, which is not
 * injectable here — so they are tested where it is (`organizations.test.ts`)
 * and nothing below ever reaches one. `rename` is the exception, and that is
 * the point of its test: it goes through the CALLER's client, because `name`
 * is the one column `authenticated` may update and an operator is 'owner'
 * everywhere. If it ever started reaching for the admin client, that test
 * would fail on the missing service-role environment.
 */

const OPERATOR_ID = '00000000-0000-0000-0000-000000000003';
// SAFETY: the route reads `id` and `email` only.
const USER: User = { id: OPERATOR_ID, email: 'operator@example.test' } as never;

const TIERS = [
	{ id: 'free', name: 'Free', organizations: [{ count: 7 }], tier_features: [{ count: 17 }] },
	{ id: 'pro', name: 'Pro', organizations: [{ count: 6 }], tier_features: [{ count: 20 }] }
];

const INDUSTRIES = [
	{ id: 'crm', name: 'CRM', organizations: [{ count: 9 }], industry_features: [{ count: 12 }] },
	{
		id: 'dentistry',
		name: 'Dentistry',
		organizations: [{ count: 4 }],
		industry_features: [{ count: 14 }]
	}
];

/** The registry as `loadFeatureRegistry()` selects it (`*` plus both embeds). */
const FEATURES = [
	{
		id: 'deals',
		name: 'Deals',
		noun: 'deal',
		description: null,
		route: '/deals',
		icon: 'handshake',
		category: 'crm',
		sort_order: 200,
		created_at: '2026-01-01T00:00:00Z',
		industry_features: [],
		tier_features: []
	}
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
		tiers: { data: TIERS },
		industries: { data: INDUSTRIES },
		features: { data: FEATURES }
	});
	const locals = { supabase: mock.supabase, user: USER };

	return {
		...mock,
		// SAFETY: the load reads locals, params and depends only.
		loadEvent: { locals, params: { id: ORG_ID }, depends: () => undefined } as never,
		// superValidate demands a real Request — a duck-typed mock is treated
		// as plain data instead of being parsed as a form post.
		post(fields: Record<string, string>) {
			const body = new FormData();
			for (const [name, value] of Object.entries(fields)) body.set(name, value);
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

/** Call one of the page's actions by name, failing loudly if it is gone. */
function run(name: 'rename' | 'setTier' | 'setIndustry' | 'setOverride' | 'clearOverride') {
	const action = actions[name];
	if (!action) throw new Error(`the organization page has no ${name} action`);
	return action;
}

describe('load', () => {
	it('names the page after the organization and offers every plan and vertical', async () => {
		const h = harness();

		const data = loaded(await load(h.loadEvent));

		expect(data.title).toBe('Acme Inc');
		expect(data.organization).toMatchObject({ id: ORG_ID, tierName: 'Free', memberCount: 1 });
		expect(data.tiers.map((tier: { id: string }) => tier.id)).toEqual(['free', 'pro']);
		expect(data.industries.map((i: { id: string }) => i.id)).toEqual(['crm', 'dentistry']);
	});

	it('starts every picker on what the organization already is', async () => {
		// So there is nothing to save until something is actually moved — the
		// page disables each button by comparing against the loaded row.
		const h = harness();

		const data = loaded(await load(h.loadEvent));

		expect(data.renameForm.data.name).toBe('Acme Inc');
		expect(data.tierForm.data.tierId).toBe('free');
		expect(data.industryForm.data.industryId).toBe('crm');
		// Except the confirmation, which is never pre-filled: typing the name
		// back is the whole point of it.
		expect(data.industryForm.data.confirm).toBe('');
	});

	it('offers the whole registry to override, not just this org’s features', async () => {
		// A `hidden` override exists precisely to take away a feature the
		// vertical includes, and an `enabled` one to grant a feature the plan
		// does not — so the picker cannot be filtered by either axis.
		const h = harness();

		const data = loaded(await load(h.loadEvent));

		expect(data.features.map((f: { id: string }) => f.id)).toEqual(['deals']);
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

		await expect(run('setTier')(h.post({ tierId: 'pro' }))).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
		expect(h.from).not.toHaveBeenCalledWith('organizations');
	});

	it('fails validation when no plan was picked', async () => {
		const h = harness();

		const result = await run('setTier')(h.post({ tierId: '' }));

		expect(isActionFailure(result) && result.status).toBe(400);
	});

	it('refuses a tier id that is not a plan on this platform', async () => {
		const h = harness();

		const result = await run('setTier')(h.post({ tierId: 'platinum' }));

		expect(isActionFailure(result)).toBe(true);
		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: 'That is not a plan on this platform.' } }
		});
	});

	it('is a 404 when the target organization has gone', async () => {
		const h = harness({ org: null });

		await expect(run('setTier')(h.post({ tierId: 'pro' }))).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
	});
});

describe('rename', () => {
	it('refuses a non-operator before looking at the form at all', async () => {
		const h = harness({ operator: false });

		await expect(run('rename')(h.post({ name: 'Globex' }))).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
	});

	it('fails validation on a blank name', async () => {
		const h = harness();

		const result = await run('rename')(h.post({ name: '   ' }));

		expect(isActionFailure(result) && result.status).toBe(400);
	});

	/**
	 * The assertion that keeps this write honest: it goes through the
	 * CALLER's client, so it completes here with no service-role environment
	 * in sight. Reaching for `createSupabaseAdminClient()` would throw.
	 */
	it('writes through the caller’s own client, never the service role', async () => {
		const h = harness();

		const result = await run('rename')(h.post({ name: 'Globex' }));

		expect(isActionFailure(result)).toBe(false);
		expect(h.builders['organizations']?.update).toHaveBeenCalledWith({ name: 'Globex' });
	});
});

describe('setIndustry', () => {
	it('refuses a non-operator before looking at the form at all', async () => {
		const h = harness({ operator: false });

		await expect(
			run('setIndustry')(h.post({ industryId: 'dentistry', confirm: 'Acme Inc' }))
		).rejects.toSatisfy((err) => isHttpError(err) && err.status === 404);
	});

	it('refuses when the typed name does not match the organization', async () => {
		// A guard against a mis-click on the widest-reaching write here — not a
		// security control, which is the operator check above.
		const h = harness();

		const result = await run('setIndustry')(h.post({ industryId: 'dentistry', confirm: 'Acme' }));

		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: 'That is not this organization’s name.' } }
		});
	});

	it('refuses an industry id that is not a vertical on this platform', async () => {
		const h = harness();

		const result = await run('setIndustry')(
			h.post({ industryId: 'astrology', confirm: 'Acme Inc' })
		);

		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: 'That is not a vertical on this platform.' } }
		});
	});
});

describe('setOverride', () => {
	it('refuses a non-operator before looking at the form at all', async () => {
		const h = harness({ operator: false });

		await expect(
			run('setOverride')(h.post({ featureId: 'deals', mode: 'enabled' }))
		).rejects.toSatisfy((err) => isHttpError(err) && err.status === 404);
	});

	it('refuses a mode outside the three an operator may force', async () => {
		// 'disabled' is the organization's own opt-out, which the table's check
		// constraint reserves — so it must not even validate here.
		const h = harness();

		const result = await run('setOverride')(h.post({ featureId: 'deals', mode: 'disabled' }));

		expect(isActionFailure(result) && result.status).toBe(400);
	});

	it('refuses a feature id that is not on this platform', async () => {
		const h = harness();

		const result = await run('setOverride')(h.post({ featureId: 'telepathy', mode: 'enabled' }));

		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: 'That is not a feature on this platform.' } }
		});
	});
});

describe('clearOverride', () => {
	it('refuses a non-operator before looking at the form at all', async () => {
		const h = harness({ operator: false });

		await expect(run('clearOverride')(h.post({ featureId: 'deals' }))).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
	});

	it('fails validation when no feature was named', async () => {
		const h = harness();

		const result = await run('clearOverride')(h.post({ featureId: '' }));

		expect(isActionFailure(result) && result.status).toBe(400);
	});
});
