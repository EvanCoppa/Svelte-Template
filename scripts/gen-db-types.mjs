#!/usr/bin/env node
/**
 * Regenerates src/lib/database.types.ts from your Supabase schema.
 *
 * Picks the source the app itself is pointed at, so the generated types always
 * match the database you are developing against:
 *
 *   - local stack  (PUBLIC_SUPABASE_URL on 127.0.0.1) → `--local`
 *   - hosted project                                  → `--project-id <ref>`
 *
 * Pass --local or --remote to override the detection.
 *
 * Env is read the way Vite reads it: .env, then .env.local (which wins), then
 * the real environment. The hosted path needs the CLI authenticated once per
 * machine (`npx supabase login`); the local path needs the stack running
 * (`npm run db:start`).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { readEnvFiles } from './dotenv.mjs';

const OUT_FILE = 'src/lib/database.types.ts';

// Same precedence as Vite: .env.local overrides .env, the environment overrides both.
const env = { ...readEnvFiles(), ...process.env };
const url = env.PUBLIC_SUPABASE_URL ?? '';

const flags = process.argv.slice(2);
const isLocal = flags.includes('--local')
	? true
	: flags.includes('--remote')
		? false
		: /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url);

const args = ['supabase', 'gen', 'types', 'typescript', '--schema', 'public'];

if (isLocal) {
	console.log('Generating types from the local stack…');
	args.push('--local');
} else {
	/**
	 * Resolve the project ref from (in order):
	 *   1. SUPABASE_PROJECT_ID in the environment or .env
	 *   2. the subdomain of PUBLIC_SUPABASE_URL (https://<ref>.supabase.co)
	 */
	let ref = env.SUPABASE_PROJECT_ID;
	if (!ref) ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\b/)?.[1];

	if (!ref || !/^[a-z0-9-]+$/.test(ref)) {
		console.error(
			'Could not determine the Supabase project ref.\n' +
				'Set PUBLIC_SUPABASE_URL in .env (https://<ref>.supabase.co), or set\n' +
				'SUPABASE_PROJECT_ID explicitly (needed when using a custom domain).\n' +
				'Working against the local stack instead? Run `npm run db:env` first,\n' +
				'or force it with `npm run db:types -- --local`.'
		);
		process.exit(1);
	}

	console.log(`Generating types from project ${ref}…`);
	args.push('--project-id', ref);
}

let output;
try {
	output = execFileSync('npx', args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
} catch {
	console.error(
		isLocal
			? '\nType generation failed. Is the local stack running? Try `npm run db:start`.'
			: '\nType generation failed. If this is an auth error, run `npx supabase login` first.'
	);
	process.exit(1);
}

writeFileSync(OUT_FILE, output);
console.log(`Wrote ${OUT_FILE} — commit it.`);
