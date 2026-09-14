import { redirect } from '@sveltejs/kit';
import { recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { listCompanies } from '$lib/server/crm/companies';
import { listContacts } from '$lib/server/crm/contacts';
import { listDeals } from '$lib/server/crm/deals';
import { listRecentEmailThreads } from '$lib/server/crm/emails';
import { hasGrant } from '$lib/server/roles';
import type { PageServerLoad } from './$types';

/**
 * The feed: the org's latest conversations, newest first, each naming the
 * records it is filed on. A read of what the mailboxes synced — the hook
 * gates the route on the `email` feature, and RLS decides which mailboxes'
 * mail this reader sees. Connecting a mailbox is a settings matter
 * (/settings/integrations), not this page's.
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	depends(QUERY.email);

	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canOpen = (kind: RecordKind) => passesFeatureGate(recordListHref(kind), features, canRead);

	const threads = await listRecentEmailThreads(supabase, activeOrgId);

	// The records the threads are filed on, named — only the kinds this
	// reader may open, so a chip is never a link to a refusal.
	const ids = { contact: new Set<string>(), company: new Set<string>(), deal: new Set<string>() };
	for (const thread of threads) {
		for (const message of thread.messages) {
			for (const link of message.links) {
				if (
					link.entityType === 'contact' ||
					link.entityType === 'company' ||
					link.entityType === 'deal'
				) {
					ids[link.entityType].add(link.entityId);
				}
			}
		}
	}
	const [contacts, companies, deals] = await Promise.all([
		canOpen('contact') && ids.contact.size > 0
			? listContacts(supabase, activeOrgId, { ids: [...ids.contact] })
			: [],
		canOpen('company') && ids.company.size > 0
			? listCompanies(supabase, activeOrgId, { ids: [...ids.company] })
			: [],
		canOpen('deal') && ids.deal.size > 0
			? listDeals(supabase, activeOrgId, { ids: [...ids.deal] })
			: []
	]);

	return {
		threads,
		records: {
			contact: Object.fromEntries(contacts.map((row) => [row.id, row.name])),
			company: Object.fromEntries(companies.map((row) => [row.id, row.name])),
			deal: Object.fromEntries(deals.map((row) => [row.id, row.title]))
		},
		canConnect: passesFeatureGate('/email', features, canRead)
	};
};
