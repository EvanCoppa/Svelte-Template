#!/usr/bin/env node
/**
 * Gives one user a set of organizations to switch between.
 *
 * `supabase/seed.sql` is the local answer to this and only the local one — it
 * runs from `db:reset`, which is the one thing you must never do to a hosted
 * project. A hosted database therefore has no seeding path at all, and the
 * gap shows the first time someone signs in there: `handle_new_user` gave
 * them a personal org and nothing else, so the team switcher has a single
 * entry and every industry-shaped difference in the product is invisible.
 * This script fills exactly that gap and nothing more — organizations and the
 * memberships that own them. No fixture rows, no CRM data.
 *
 * It writes with the service-role key because it has to: `industry_id` and
 * `tier_id` are operator-owned columns (the organizations migration revokes
 * them from `authenticated`), so no browser session can set them. Which
 * database it writes to is the same rule `npm run db:types` uses — whatever
 * `PUBLIC_SUPABASE_URL` points at — so with `.env.local` in place it targets
 * the local stack, which is where you should try it first.
 *
 *   node scripts/seed-user-orgs.mjs --email you@example.com            # plan only
 *   node scripts/seed-user-orgs.mjs --email you@example.com --apply    # write it
 *
 * Nothing is written without `--apply`: the default run reads the account,
 * prints what it would create and exits. Re-running is a no-op — an
 * organization is created only when the user is not already in one by that
 * name — so the safe move on any doubt is to run it again and read the plan.
 *
 * Against production, pass the credentials for one command rather than
 * writing a service-role key into a file (the real environment wins over
 * `.env` and `.env.local`, same precedence as Vite):
 *
 *   PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<secret key> \
 *   node scripts/seed-user-orgs.mjs --email you@example.com --apply
 *
 * The key is in the dashboard under Project Settings → API keys. It bypasses
 * RLS completely, so it belongs in a shell for the length of one command and
 * nowhere else.
 */
import { createClient } from '@supabase/supabase-js';
import { readEnvFiles } from './dotenv.mjs';

/**
 * The organizations to give the user, on top of the personal org the signup
 * trigger already made them. Add a row here to add one; everything below is
 * generic.
 *
 * Industry and tier are the whole point of the list. Together they decide
 * which features an org has (`private.feature_mode()`, docs/features.md), so
 * choosing them deliberately is what makes the switcher worth switching:
 * these two land either side of a personal org left on the free CRM default,
 * where most of the catalog reads `locked_visible`.
 */
const ORGS = [
	// A full pipeline. Pro unlocks deals, products and the assistant, and
	// best-practices is not in this industry at all — so it is not there to
	// upsell either.
	{ name: 'Coppa Medical Supply', industry: 'medical-supplies', tier: 'pro' },
	// The opposite shape: a practice, not a pipeline. Enterprise unlocks
	// everything a plan can, and dentistry still has neither a deals board
	// nor best-practices — the industry axis wins over the plan.
	{ name: 'Coppa Family Dental', industry: 'dentistry', tier: 'enterprise' }
];

const USAGE = `Usage: node scripts/seed-user-orgs.mjs --email <address> [--apply]

  --email <address>  the user to seed, matched against their auth email
  --apply            actually write; without it the run only prints the plan
`;

const argv = process.argv.slice(2);

/**
 * The value after a flag, or undefined when the flag is absent.
 *
 * @param {string} name
 * @returns {string | undefined}
 */
function flagValue(name) {
	const index = argv.indexOf(name);
	return index === -1 ? undefined : argv[index + 1];
}

/**
 * Stops with a message. Every exit path in this script goes through here, so
 * a failure reads the same whether it came from a flag or from Postgres.
 *
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
	console.error(`\n${message}\n`);
	process.exit(1);
}

if (argv.includes('--help') || argv.includes('-h')) {
	console.log(USAGE);
	process.exit(0);
}

const apply = argv.includes('--apply');

// GoTrue stores emails lowercased, and so therefore does the profiles copy.
const email = (flagValue('--email') ?? '').trim().toLowerCase();
if (!email) fail(`No user given.\n\n${USAGE}`);

// Same precedence as Vite: .env.local overrides .env, the environment overrides both.
const env = { ...readEnvFiles(), ...process.env };
const url = env.PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!url) {
	fail(
		'PUBLIC_SUPABASE_URL is not set.\n' +
			'Point this checkout at a database first — `npm run db:env` for the local\n' +
			'stack, or set the variable for this command to reach a hosted project.'
	);
}

if (!serviceRoleKey) {
	fail(
		'SUPABASE_SERVICE_ROLE_KEY is not set.\n' +
			'Organizations carry industry_id and tier_id, which no browser session may\n' +
			'write, so this script needs the service-role key. `npm run db:env` writes\n' +
			'the local one; a hosted key is in Project Settings → API keys and should be\n' +
			'passed for one command rather than saved to a file.'
	);
}

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url);

const supabase = createClient(url, serviceRoleKey, {
	auth: { autoRefreshToken: false, persistSession: false }
});

console.log(`Target: ${url}${isLocal ? ' (local stack)' : ' (hosted project)'}`);

// ---------------------------------------------------------------------------
// Read: who this is, what the catalogs allow, what they already have
// ---------------------------------------------------------------------------

// profiles.email is a trigger-maintained copy of auth.users.email (the staff
// management migration), which makes it the one place a plain PostgREST query
// can resolve an address to a user id.
const profile = await supabase
	.from('profiles')
	.select('id, display_name')
	.eq('email', email)
	.maybeSingle();

if (profile.error) fail(`Could not look up ${email}: ${profile.error.message}`);
if (!profile.data) {
	fail(
		`No user with the email ${email} on ${url}.\n` +
			'This template ships no signup page, so accounts are created in the\n' +
			'dashboard under Authentication → Users. Create it there, then run this again.'
	);
}

const userId = profile.data.id;

const [industries, tiers, memberships] = await Promise.all([
	supabase.from('industries').select('id'),
	supabase.from('tiers').select('id'),
	// The foreign key is named because `member_roles` references both tables
	// too, which makes a bare `organizations(...)` embed ambiguous to
	// PostgREST (PGRST201) — the same trap loadOrgContext documents in the
	// other direction.
	supabase
		.from('organization_members')
		.select('role, organizations!organization_members_org_id_fkey(id, name, tier_id, industry_id)')
		.eq('user_id', userId)
]);

if (industries.error) fail(`Could not read the industry catalog: ${industries.error.message}`);
if (tiers.error) fail(`Could not read the tier catalog: ${tiers.error.message}`);
if (memberships.error) fail(`Could not read the organizations: ${memberships.error.message}`);

const industryIds = industries.data.map((row) => row.id);
const tierIds = tiers.data.map((row) => row.id);

// Fail on the whole list before writing any of it: a typo caught here costs
// nothing, while the same typo caught by a foreign key leaves half the set
// created and the plan printed above it a lie.
for (const org of ORGS) {
	if (!industryIds.includes(org.industry)) {
		fail(
			`${org.name} wants the industry '${org.industry}', which this database does not have.\n` +
				`Known industries: ${industryIds.join(', ')}`
		);
	}
	if (!tierIds.includes(org.tier)) {
		fail(
			`${org.name} wants the tier '${org.tier}', which this database does not have.\n` +
				`Known tiers: ${tierIds.join(', ')}`
		);
	}
}

const existing = memberships.data.map((row) => row.organizations);
const existingNames = new Set(existing.map((org) => org.name));

/**
 * One line of the switcher, the way the org context sorts it.
 *
 * @param {{ name: string, tier_id: string, industry_id: string }} org
 * @returns {string}
 */
const describe = (org) => `${org.name} — ${org.tier_id} · ${org.industry_id}`;

console.log(`User:   ${profile.data.display_name ?? email} (${userId})`);
console.log(`\nAlready in ${existing.length} organization(s):`);
for (const org of [...existing].sort((a, b) => a.name.localeCompare(b.name))) {
	console.log(`  · ${describe(org)}`);
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const missing = ORGS.filter((org) => !existingNames.has(org.name));

if (missing.length === 0) {
	console.log('\nNothing to do — every organization in the list already exists.');
	process.exit(0);
}

console.log(`\nWould create ${missing.length} organization(s), owned by this user:`);
for (const org of missing) {
	console.log(`  + ${org.name} — ${org.tier} · ${org.industry}`);
}

if (!apply) {
	console.log('\nDry run: nothing was written. Re-run with --apply to create them.');
	process.exit(0);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

console.log('');

for (const org of missing) {
	const created = await supabase
		.from('organizations')
		.insert({ name: org.name, industry_id: org.industry, tier_id: org.tier })
		.select('id')
		.single();

	if (created.error) fail(`Could not create ${org.name}: ${created.error.message}`);

	// handle_new_organization() only writes the owner row when a JWT is in
	// play, and the service role has none — so the membership is this
	// script's job, exactly as it is seed.sql's.
	const member = await supabase
		.from('organization_members')
		.insert({ org_id: created.data.id, user_id: userId, role: 'owner' });

	if (member.error) {
		// An organization with no members is visible to nobody and cannot be
		// deleted from the app, so undo it here rather than leave the account
		// worse than it started.
		await supabase.from('organizations').delete().eq('id', created.data.id);
		fail(
			`Could not make the user owner of ${org.name}, so it was removed: ${member.error.message}`
		);
	}

	console.log(`  ✓ ${org.name} (${created.data.id})`);
}

// Read the result back rather than assuming it — the switcher shows what the
// database says, and so should the last thing this prints.
const after = await supabase
	.from('organization_members')
	.select('organizations!organization_members_org_id_fkey(name, tier_id, industry_id)')
	.eq('user_id', userId);

if (after.error) {
	console.log('\nCreated. Could not re-read the organizations to confirm, so check the app.');
	process.exit(0);
}

console.log('\nThe switcher now holds:');
for (const row of after.data
	.map((r) => r.organizations)
	.sort((a, b) => a.name.localeCompare(b.name))) {
	console.log(`  · ${describe(row)}`);
}
