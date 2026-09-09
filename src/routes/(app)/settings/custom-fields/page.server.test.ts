import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { actions, load } from './+page.server';
import type { OrgContext } from '$lib/server/org-context';
import { ORG_ID, supabaseMock } from '$lib/server/crm/test-support';

const feature = (id: string, route: string) => ({
	id,
	name: id,
	noun: null,
	description: null,
	route,
	icon: null,
	category: 'crm',
	sort_order: 0,
	created_at: ''
});

/** Contacts are on screen; products are not, so their fields must not be listed. */
function context(role: 'owner' | 'member'): OrgContext {
	return {
		organizations: [],
		activeOrg: {
			id: ORG_ID,
			name: 'Bright Smile Dental',
			role,
			tierId: 'pro',
			tierName: 'Pro',
			industryId: 'dentistry'
		},
		features: {
			contacts: { feature: feature('contacts', '/contacts'), mode: 'enabled' },
			products: { feature: feature('products', '/products'), mode: 'hidden' }
		},
		access: { role, roles: [], grants: new Map() }
	};
}

function harness(role: 'owner' | 'member', result: Parameters<typeof supabaseMock>[0] = {}) {
	const mock = supabaseMock(result);
	const locals = { org: context(role), activeOrgId: ORG_ID, supabase: mock.supabase };
	return {
		...mock,
		locals,
		// superValidate demands a real Request — a duck-typed mock is treated as
		// plain data instead of being parsed as a form post.
		post(fields: Record<string, string>) {
			const body = new FormData();
			for (const [name, value] of Object.entries(fields)) body.append(name, value);
			// SAFETY: the actions read locals and request only.
			return {
				locals,
				request: new Request('https://app.test/settings/custom-fields', {
					method: 'POST',
					body
				})
			} as never;
		}
	};
}

function loaded<T>(data: T | void): T {
	if (data === undefined) throw new Error('expected load data');
	// SAFETY: the guard above rules out the void branch.
	return data as T;
}

const CHANNEL = {
	id: 'a3000000-0000-0000-0000-000000000004',
	org_id: ORG_ID,
	entity_type: 'contact',
	key: 'preferred_channel',
	label: 'Preferred channel',
	value_type: 'select',
	allowed_values: ['email', 'phone'],
	created_at: '',
	updated_at: ''
};

describe('custom fields settings load', () => {
	it('offers and lists only the kinds this session may open', async () => {
		const productField = { ...CHANNEL, id: 'd9', entity_type: 'product' };
		const h = harness('owner', { data: [CHANNEL, productField] });

		// SAFETY: the load reads locals and depends only.
		const data = loaded(await load({ locals: h.locals, depends: () => {} } as never));

		expect(data.kinds).toContain('contact');
		expect(data.kinds).not.toContain('product');
		// A kind the page cannot name is a kind it must not list.
		expect(data.definitions).toEqual([CHANNEL]);
		expect(data.canManage).toBe(true);
	});

	it('reports a member as unable to manage', async () => {
		const h = harness('member', { data: [] });
		// SAFETY: the load reads locals and depends only.
		const data = loaded(await load({ locals: h.locals, depends: () => {} } as never));
		expect(data.canManage).toBe(false);
	});
});

describe('custom fields settings actions', () => {
	it('refuses a member: declaring fields is org configuration', async () => {
		const h = harness('member');
		await expect(
			actions.create(h.post({ entity_type: 'contact', key: 'k', label: 'K', value_type: 'text' }))
		).rejects.toSatisfy((error) => isHttpError(error) && error.status === 403);
	});

	it('rejects a key that is not snake_case', async () => {
		const h = harness('owner');
		const result = await actions.create(
			h.post({ entity_type: 'contact', key: 'Preferred-Channel', label: 'K', value_type: 'text' })
		);
		expect(result).toMatchObject({ status: 400 });
		expect(h.builder.insert).not.toHaveBeenCalled();
	});

	it('rejects a choice list with no choices', async () => {
		const h = harness('owner');
		const result = await actions.create(
			h.post({
				entity_type: 'contact',
				key: 'channel',
				label: 'Channel',
				value_type: 'select',
				allowed_values: '  ,  '
			})
		);
		expect(result).toMatchObject({ status: 400 });
		expect(h.builder.insert).not.toHaveBeenCalled();
	});

	it('splits a select’s choices and stores null for every other type', async () => {
		const select = harness('owner', { data: CHANNEL });
		await actions.create(
			select.post({
				entity_type: 'contact',
				key: 'channel',
				label: 'Channel',
				value_type: 'select',
				allowed_values: 'email, phone, email'
			})
		);
		// Deduped, in order, blank-free.
		expect(select.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ allowed_values: ['email', 'phone'] })
		);

		const text = harness('owner', { data: CHANNEL });
		await actions.create(
			text.post({
				entity_type: 'contact',
				key: 'insurer',
				label: 'Insurer',
				value_type: 'text',
				allowed_values: 'ignored'
			})
		);
		expect(text.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ allowed_values: null })
		);
	});

	it('never sends value_type or entity_type when editing', async () => {
		const h = harness('owner', { data: [CHANNEL] });

		await actions.update(
			h.post({ id: CHANNEL.id, key: 'channel', label: 'Channel', allowed_values: 'email, phone' })
		);

		expect(h.builder.update).toHaveBeenCalledWith({
			key: 'channel',
			label: 'Channel',
			allowed_values: ['email', 'phone']
		});
	});

	it('surfaces a database refusal as a form message rather than throwing', async () => {
		const h = harness('owner', {
			error: { message: 'custom field has values; its type cannot change' }
		});

		const result = await actions.create(
			h.post({ entity_type: 'contact', key: 'channel', label: 'Channel', value_type: 'text' })
		);

		// A failed message() is an ActionFailure, so the form sits under `data`.
		expect(result).toMatchObject({
			status: 400,
			data: {
				form: expect.objectContaining({
					message: 'custom field has values; its type cannot change'
				})
			}
		});
	});
});
