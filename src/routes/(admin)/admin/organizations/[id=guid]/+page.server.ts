import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import {
	listFeatureDirectory,
	listIndustryDirectory,
	listTierDirectory
} from '$lib/server/admin/catalog';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import {
	clearFeatureOverride,
	findOrganization,
	getOrganization,
	renameOrganization,
	setFeatureOverride,
	setOrganizationIndustry,
	setOrganizationTier
} from '$lib/server/admin/organizations';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import {
	clearOverrideSchema,
	renameSchema,
	setIndustrySchema,
	setOverrideSchema,
	setTierSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One organization, and everything the platform decides ABOUT it: its name,
 * its plan, its vertical and the per-feature overrides that win over both.
 *
 * The target organization is the one in the URL and nothing else: the
 * platform area never reads the active-organization cookie, so an operator
 * can be working in Acme in the app and editing Globex here without either
 * affecting the other.
 *
 * What the organization decides for ITSELF is shown and never written here —
 * its members, their roles, and the features it switched off at
 * /settings/features. An operator who needs to change one of those does it
 * as a member of that org, where the act is attributable and the org's own
 * policies apply.
 *
 * The page's own `title` is the organization's name — the one case where a
 * page is not named by the nav list, the same exception the `(app)` shell
 * makes for a record page.
 */

/**
 * Explicit form ids, shared by the load, the actions and the `superForm`
 * instances on the page — the staff page's convention, and for its reason:
 * superforms derives an id from the schema's SHAPE, and two of these
 * (`setOverride` and `clearOverride`) both lead with `featureId`, so without
 * ids a cleared override could answer to the setter's result.
 */
const FORM_IDS = {
	rename: 'rename',
	setTier: 'set-tier',
	setIndustry: 'set-industry',
	setOverride: 'set-override',
	clearOverride: 'clear-override'
} as const;

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminOrganizations);

	const organization = await getOrganization(locals.supabase, params.id);
	// Indistinguishable from an id that names nothing, which is what it is
	// for anyone the organizations policy does not show this row to.
	if (!organization) throw error(404, 'Not found.');

	const [tiers, industries, features, renameForm, tierForm, industryForm, overrideForm, clearForm] =
		await Promise.all([
			listTierDirectory(locals.supabase),
			listIndustryDirectory(locals.supabase),
			// The whole registry, because an override can name any feature —
			// including one this organization's vertical does not include, which
			// is precisely what a `hidden` override is for.
			listFeatureDirectory(locals.supabase),
			superValidate({ name: organization.name }, zod4(renameSchema), {
				id: FORM_IDS.rename,
				errors: false
			}),
			superValidate({ tierId: organization.tierId }, zod4(setTierSchema), {
				id: FORM_IDS.setTier,
				errors: false
			}),
			superValidate({ industryId: organization.industryId, confirm: '' }, zod4(setIndustrySchema), {
				id: FORM_IDS.setIndustry,
				errors: false
			}),
			superValidate(zod4(setOverrideSchema), { id: FORM_IDS.setOverride }),
			superValidate(zod4(clearOverrideSchema), { id: FORM_IDS.clearOverride })
		]);

	return {
		organization,
		tiers,
		industries,
		features,
		renameForm,
		tierForm,
		industryForm,
		overrideForm,
		clearForm,
		title: organization.name
	};
};

/**
 * The trace every platform write leaves for now. A real audit TABLE is
 * deferred work (docs/platform-administration.md); until there is one, the
 * server log is where a change is answerable for — so each line records who
 * did it, which organization it landed on, and what the value was before.
 */
function logChange(what: string, fields: Record<string, string | number | null>) {
	console.info(`[platform-admin] ${what}`, fields);
}

/**
 * What every action here does before it writes: prove the caller is an
 * operator (a POST reaches an action with no load in front of it, so the
 * layout's check has not run), then prove the target organization exists —
 * through the CALLER's client, so "does it exist" is answered by the same
 * RLS that decides whether this caller may see it at all. That is the
 * org-visibility check the staff actions make, never a membership lookup.
 */
async function target(locals: App.Locals, id: string) {
	const operator = await requireSystemAdmin(locals);
	const organization = await findOrganization(locals.supabase, id);
	if (!organization) throw error(404, 'Not found.');
	return { operator, organization };
}

export const actions: Actions = {
	/**
	 * Rename this organization — the one write here that does NOT take the
	 * service-role client, because it does not need it: `name` is the single
	 * column `authenticated` may update, and an operator is 'owner' on every
	 * organization. RLS carries it, so RLS is left in the path.
	 */
	rename: async ({ request, locals, params }) => {
		const { operator, organization } = await target(locals, params.id);

		const form = await superValidate(request, zod4(renameSchema), { id: FORM_IDS.rename });
		if (!form.valid) return fail(400, { form });

		try {
			await renameOrganization(locals.supabase, organization.id, form.data.name);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not rename the organization.',
				{
					status: 400
				}
			);
		}

		logChange('organization renamed', {
			operator: operator.id,
			organization: organization.id,
			from: organization.name,
			to: form.data.name
		});

		return { form };
	},

	/**
	 * Move this organization to another plan. The requested tier is checked
	 * against the `tiers` table for a readable message, with the foreign key
	 * as the backstop, before the service-role client is created at all:
	 * `organizations.tier_id` is revoked from `authenticated`, so this column
	 * is operator-owned and the update cannot go through the caller's client.
	 */
	setTier: async ({ request, locals, params }) => {
		const { operator, organization } = await target(locals, params.id);

		const form = await superValidate(request, zod4(setTierSchema), { id: FORM_IDS.setTier });
		if (!form.valid) return fail(400, { form });

		const tiers = await listTierDirectory(locals.supabase);
		const tier = tiers.find((t) => t.id === form.data.tierId);
		if (!tier) return message(form, 'That is not a plan on this platform.', { status: 400 });

		try {
			await setOrganizationTier(createSupabaseAdminClient(), organization.id, tier.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not change the plan.', {
				status: 400
			});
		}

		logChange('organization tier changed', {
			operator: operator.id,
			organization: organization.id,
			from: organization.tierId,
			to: tier.id
		});

		return { form };
	},

	/**
	 * Move this organization to another vertical — the widest-reaching write
	 * in the area, so it is the one that asks for the organization's name to
	 * be typed back. That confirmation is a guard against a mis-click, not a
	 * security control: the operator check above is the security control, and
	 * this runs after it.
	 *
	 * Changing the vertical re-resolves which features exist, what they are
	 * called, what order they sit in, the vocabulary and which roles may be
	 * handed out — all on the organization's next request. Assignments
	 * pointing at the old vertical's roles go inert rather than granting
	 * anything (see `setOrganizationIndustry()`), which is why the page says
	 * how many there are before this is posted.
	 */
	setIndustry: async ({ request, locals, params }) => {
		const { operator, organization } = await target(locals, params.id);

		const form = await superValidate(request, zod4(setIndustrySchema), {
			id: FORM_IDS.setIndustry
		});
		if (!form.valid) return fail(400, { form });

		if (form.data.confirm !== organization.name) {
			return message(form, 'That is not this organization’s name.', { status: 400 });
		}

		const industries = await listIndustryDirectory(locals.supabase);
		const industry = industries.find((i) => i.id === form.data.industryId);
		if (!industry)
			return message(form, 'That is not a vertical on this platform.', { status: 400 });

		try {
			await setOrganizationIndustry(createSupabaseAdminClient(), organization.id, industry.id);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not change the vertical.',
				{
					status: 400
				}
			);
		}

		logChange('organization industry changed', {
			operator: operator.id,
			organization: organization.id,
			from: organization.industryId,
			to: industry.id
		});

		return { form };
	},

	/**
	 * Force one feature to one mode for this organization — the escape hatch
	 * the features migration reserves for operators, which until now had no
	 * path but SQL. The feature is checked against the registry so a typo is
	 * a readable message rather than a foreign-key error, and a blank note is
	 * stored as null: the column means "nothing was said", not "".
	 */
	setOverride: async ({ request, locals, params }) => {
		const { operator, organization } = await target(locals, params.id);

		const form = await superValidate(request, zod4(setOverrideSchema), {
			id: FORM_IDS.setOverride
		});
		if (!form.valid) return fail(400, { form });

		const features = await listFeatureDirectory(locals.supabase);
		if (!features.some((f) => f.id === form.data.featureId)) {
			return message(form, 'That is not a feature on this platform.', { status: 400 });
		}

		try {
			await setFeatureOverride(
				createSupabaseAdminClient(),
				organization.id,
				form.data.featureId,
				form.data.mode,
				form.data.note?.trim() || null
			);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not set the override.', {
				status: 400
			});
		}

		logChange('organization feature override set', {
			operator: operator.id,
			organization: organization.id,
			feature: form.data.featureId,
			mode: form.data.mode
		});

		return { form };
	},

	/** Drop an override, returning the feature to what the plan and vertical say. */
	clearOverride: async ({ request, locals, params }) => {
		const { operator, organization } = await target(locals, params.id);

		const form = await superValidate(request, zod4(clearOverrideSchema), {
			id: FORM_IDS.clearOverride
		});
		if (!form.valid) return fail(400, { form });

		try {
			await clearFeatureOverride(createSupabaseAdminClient(), organization.id, form.data.featureId);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not clear the override.',
				{
					status: 400
				}
			);
		}

		logChange('organization feature override cleared', {
			operator: operator.id,
			organization: organization.id,
			feature: form.data.featureId
		});

		return { form };
	}
};
