/**
 * Which records a message is about — the pure half of ingestion.
 *
 * A synced message is kept only when it involves someone the org keeps a
 * record of (docs/email.md, "Only matched mail is stored"). This module
 * answers that from addresses alone, with no database in reach, so the rule
 * is one function with a test beside it:
 *
 *   - an address that IS a contact's email files the message on that
 *     contact and, when they belong to one, their company (`participant`);
 *   - an address at a company's own domain (its website's host, or its
 *     email's domain) files it on that company (`domain`) — unless the
 *     domain is a free-mail provider, where everyone's address lives;
 *   - an address on a mailbox's exclusion list keeps the whole message out;
 *   - a message between members alone, with nobody external on it, is never
 *     stored (Attio's internal-thread rule).
 *
 * Deals join later by hand (`email_message_links.source = 'manual'`) — a
 * deal has no address of its own to match on.
 */

export type MatchLink = {
	entityType: 'contact' | 'company' | 'deal';
	entityId: string;
	source: 'participant' | 'domain' | 'manual';
};

/** What the worker knows about one org, read once per job. */
export type MatchIndex = {
	/** Lower-cased contact email → the contact and their company. */
	contactsByEmail: ReadonlyMap<string, { id: string; companyId: string | null }>;
	/** Lower-cased company domain → company id. */
	companiesByDomain: ReadonlyMap<string, string>;
	/** The org's members' own addresses (their profiles and connected mailboxes). */
	memberAddresses: ReadonlySet<string>;
};

export type MatchOutcome = {
	/** Address → contact id, for the participants table. */
	contactsByAddress: ReadonlyMap<string, string>;
	links: MatchLink[];
	/** Nobody outside the org is on the message. */
	internalOnly: boolean;
};

/**
 * Domains where anybody can have an address, so a domain match on one would
 * file every gmail.com correspondent on whichever company listed one.
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
	'gmail.com',
	'googlemail.com',
	'outlook.com',
	'hotmail.com',
	'live.com',
	'msn.com',
	'yahoo.com',
	'yahoo.co.uk',
	'ymail.com',
	'icloud.com',
	'me.com',
	'mac.com',
	'aol.com',
	'proton.me',
	'protonmail.com',
	'pm.me',
	'gmx.com',
	'gmx.net',
	'mail.com',
	'zoho.com',
	'fastmail.com',
	'hey.com'
]);

export function normalizeAddress(address: string): string {
	return address.trim().toLowerCase();
}

/** The part after the @, or null for something that is not an address. */
export function domainOf(address: string): string | null {
	const at = address.lastIndexOf('@');
	if (at <= 0 || at === address.length - 1) return null;
	return address.slice(at + 1).toLowerCase();
}

/**
 * Does an exclusion pattern cover the address? A pattern is a whole address
 * (`someone@example.com`) or a domain (`@example.com`), lower-cased by the
 * table's check constraint; a domain pattern also covers subdomains.
 */
export function isExcluded(address: string, patterns: readonly string[]): boolean {
	const normalized = normalizeAddress(address);
	const domain = domainOf(normalized);
	return patterns.some((pattern) => {
		if (pattern.startsWith('@')) {
			const excluded = pattern.slice(1);
			return domain === excluded || (domain?.endsWith(`.${excluded}`) ?? false);
		}
		return pattern === normalized;
	});
}

/**
 * The domains a company's mail comes from: its website's host without a
 * leading `www.`, and its own email's domain. Free-mail domains are dropped —
 * a company whose email is on gmail.com does not own gmail.com.
 */
export function companyDomains(company: {
	website: string | null;
	email: string | null;
}): string[] {
	const domains = new Set<string>();
	const host = hostOf(company.website);
	if (host) domains.add(host);
	const emailDomain = company.email ? domainOf(normalizeAddress(company.email)) : null;
	if (emailDomain) domains.add(emailDomain);
	return [...domains].filter((domain) => !FREE_MAIL_DOMAINS.has(domain));
}

function hostOf(website: string | null): string | null {
	const trimmed = website?.trim();
	if (!trimmed) return null;
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const host = new URL(withScheme).hostname.toLowerCase();
		return host.replace(/^www\./, '') || null;
	} catch {
		return null;
	}
}

/**
 * File a message by the addresses on it. The addresses are every From, To,
 * Cc, Bcc and Reply-To on the message, in any order and case; the outcome
 * lists each link once.
 */
export function matchMessage(addresses: readonly string[], index: MatchIndex): MatchOutcome {
	const contactsByAddress = new Map<string, string>();
	const seen = new Set<string>();
	const links: MatchLink[] = [];
	let external = false;

	const add = (link: MatchLink) => {
		const key = `${link.entityType}:${link.entityId}`;
		if (seen.has(key)) return;
		seen.add(key);
		links.push(link);
	};

	for (const raw of addresses) {
		const address = normalizeAddress(raw);
		if (!address) continue;
		if (!index.memberAddresses.has(address)) external = true;

		const contact = index.contactsByEmail.get(address);
		if (contact) {
			contactsByAddress.set(address, contact.id);
			add({ entityType: 'contact', entityId: contact.id, source: 'participant' });
			if (contact.companyId) {
				add({ entityType: 'company', entityId: contact.companyId, source: 'participant' });
			}
			continue;
		}

		const domain = domainOf(address);
		if (!domain || FREE_MAIL_DOMAINS.has(domain)) continue;
		const company = index.companiesByDomain.get(domain);
		if (company) add({ entityType: 'company', entityId: company, source: 'domain' });
	}

	return { contactsByAddress, links, internalOnly: !external };
}
