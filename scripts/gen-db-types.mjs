#!/usr/bin/env node
/**
 * Regenerates src/lib/database.types.ts from your Supabase project's schema.
 *
 * Resolves the project ref from (in order):
 *   1. SUPABASE_PROJECT_ID in the environment or .env
 *   2. the subdomain of PUBLIC_SUPABASE_URL (https://<ref>.supabase.co)
 *
 * Requires the Supabase CLI to be authenticated once per machine:
 *   npx supabase login
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OUT_FILE = 'src/lib/database.types.ts';

function readDotEnv(path) {
	if (!existsSync(path)) return {};
	const env = {};
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
	}
	return env;
}

const env = { ...readDotEnv('.env'), ...process.env };

let ref = env.SUPABASE_PROJECT_ID;
if (!ref) {
	const url = env.PUBLIC_SUPABASE_URL ?? '';
	ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\b/)?.[1];
}

if (!ref || !/^[a-z0-9-]+$/.test(ref)) {
	console.error(
		'Could not determine the Supabase project ref.\n' +
			'Set PUBLIC_SUPABASE_URL in .env (https://<ref>.supabase.co), or set\n' +
			'SUPABASE_PROJECT_ID explicitly (needed when using a custom domain).'
	);
	process.exit(1);
}

console.log(`Generating types from project ${ref}…`);
let output;
try {
	output = execFileSync(
		'npx',
		['supabase', 'gen', 'types', 'typescript', '--project-id', ref, '--schema', 'public'],
		{ encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }
	);
} catch {
	console.error(
		'\nType generation failed. If this is an auth error, run `npx supabase login` first.'
	);
	process.exit(1);
}

writeFileSync(OUT_FILE, output);
console.log(`Wrote ${OUT_FILE} — commit it.`);
