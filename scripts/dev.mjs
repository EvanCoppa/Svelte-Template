#!/usr/bin/env node
/**
 * `npm run dev` — the whole local loop in one command.
 *
 * Chains the steps you would otherwise run by hand before Vite:
 *
 *   npm run db:start  →  npm run db:env  →  npm run db:reset  →  vite dev
 *
 * Each one is skipped when it is already done, so the first run of the day
 * boots Docker and seeds the database and every run after it goes straight to
 * Vite. The `db:*` scripts still exist and still do exactly what they say —
 * this only sequences them.
 *
 * Which database? Whatever this checkout is already pointed at:
 *
 *   - no PUBLIC_SUPABASE_URL, or one on 127.0.0.1 → manage the local stack
 *   - a hosted project (or CI)                    → start Vite and nothing else
 *
 * So `npm run db:env` opts in (it writes a local URL to `.env.local`) and
 * `rm .env.local` opts back out, exactly as it did before.
 *
 * Flags — everything else is forwarded to Vite (`npm run dev -- --host`):
 *
 *   --fresh     reset the database even when nothing has changed
 *   --no-reset  never reset, even when the migrations have changed
 *   --skip-db   leave the stack alone entirely and just start Vite
 *   --local     manage the local stack whatever the configured URL says
 *   --hosted    the opposite
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { readEnvFiles } from './dotenv.mjs';

const MIGRATIONS_DIR = 'supabase/migrations';
const SEED_FILE = 'supabase/seed.sql';

/**
 * Fingerprint of the schema this script last applied, so a reset only happens
 * when a migration or the seed actually changed. It lives under node_modules
 * because that is per-machine scratch nothing has to gitignore — and because a
 * fresh `npm ci` then costs one extra reset instead of leaving a stale claim
 * about a database it knows nothing about.
 */
const STAMP_FILE = 'node_modules/.cache/dev-db-stamp';

const OWN_FLAGS = ['--fresh', '--no-reset', '--skip-db', '--local', '--hosted'];

const argv = process.argv.slice(2);
const viteArgs = argv.filter((arg) => !OWN_FLAGS.includes(arg));

/** @param {string} name */
const flag = (name) => argv.includes(name);

/**
 * Runs a command with the terminal attached, so its output and prompts are the
 * ones you would see running it yourself.
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {boolean} whether it exited cleanly
 */
function run(command, args) {
	return spawnSync(command, args, { stdio: 'inherit' }).status === 0;
}

/** Whether the local stack is already up — `supabase status` fails when it isn't. */
function stackIsRunning() {
	return spawnSync('npx', ['supabase', 'status', '-o', 'json'], { stdio: 'ignore' }).status === 0;
}

/** Hash of every migration plus the seed: changes exactly when a reset is owed. */
function schemaFingerprint() {
	const hash = createHash('sha256');
	const files = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR) : [];
	const migrations = files.filter((name) => name.endsWith('.sql')).sort();
	for (const name of migrations) {
		hash.update(name);
		hash.update(readFileSync(join(MIGRATIONS_DIR, name)));
	}
	if (existsSync(SEED_FILE)) hash.update(readFileSync(SEED_FILE));
	return hash.digest('hex');
}

function readStamp() {
	try {
		return readFileSync(STAMP_FILE, 'utf8').trim();
	} catch {
		return '';
	}
}

/** @param {string} fingerprint */
function writeStamp(fingerprint) {
	mkdirSync(dirname(STAMP_FILE), { recursive: true });
	writeFileSync(STAMP_FILE, `${fingerprint}\n`);
}

/** Boot the stack, point `.env.local` at it, and apply the schema if it moved. */
function prepareLocalStack() {
	if (!stackIsRunning()) {
		console.log('Starting the local Supabase stack (the first run pulls Docker images)…');
		if (!run('npx', ['supabase', 'start'])) {
			console.error(
				'\nCould not start the local Supabase stack — it needs Docker running.\n' +
					'Start Docker and try again, or run `npm run dev -- --skip-db` to start\n' +
					'Vite against whatever .env already points at.'
			);
			process.exit(1);
		}
	}

	// Cheap, and it keeps the checkout pointed at the right ports and keys after
	// a config or CLI change instead of failing later with a stale .env.local.
	if (!run('node', ['scripts/local-env.mjs'])) process.exit(1);

	if (flag('--no-reset')) return;

	const fingerprint = schemaFingerprint();
	if (!flag('--fresh') && readStamp() === fingerprint) {
		console.log('Database matches the migrations — skipping the reset (force it with --fresh).');
		return;
	}

	console.log('Applying every migration and supabase/seed.sql…');
	if (!run('npx', ['supabase', 'db', 'reset'])) {
		console.error('\n`supabase db reset` failed — fix the migration and run `npm run dev` again.');
		process.exit(1);
	}
	writeStamp(fingerprint);
}

/**
 * The one field this needs out of Vite's own package manifest — where its CLI
 * lives, relative to the package — parsed at the boundary so the rest of the
 * script has a path rather than "whatever `bin` happened to be". npm allows
 * both spellings; a single-binary package may write it as a bare string.
 */
const viteManifest = z.object({
	bin: z.union([z.string().min(1), z.object({ vite: z.string().min(1) }).transform((b) => b.vite)])
});

/**
 * This project's own Vite. Not `npx vite`: with node_modules missing, npx
 * silently downloads whatever the latest version is and runs that instead.
 */
function viteBin() {
	const require = createRequire(import.meta.url);
	let manifest, contents;
	try {
		// Vite's package exports don't include ./bin/vite.js, so go via its manifest.
		manifest = require.resolve('vite/package.json');
		contents = JSON.parse(readFileSync(manifest, 'utf8'));
	} catch {
		console.error('Could not find Vite in node_modules — run `npm install` first.');
		process.exit(1);
	}

	const parsed = viteManifest.safeParse(contents);
	if (!parsed.success) {
		console.error(`${manifest} does not declare a Vite binary. Run \`npx vite dev\` directly.`);
		process.exit(1);
	}

	return join(dirname(manifest), parsed.data.bin);
}

function startVite() {
	const vite = spawn(process.execPath, [viteBin(), 'dev', ...viteArgs], { stdio: 'inherit' });

	// Ctrl-C reaches Vite already — the terminal signals the whole process group
	// — but a bare `kill` on this process would not, and the dev server would
	// outlive it holding the port.
	process.on('SIGINT', () => vite.kill('SIGINT'));
	process.on('SIGTERM', () => vite.kill('SIGTERM'));

	// Exit the way Vite did, so a terminal, npm or Playwright's webServer sees
	// the outcome it would have seen from `vite dev` directly. A null code means
	// a signal killed it, which is not a clean exit.
	vite.on('exit', (code) => process.exit(code ?? 1));
}

// Same precedence as Vite: .env.local overrides .env, the environment overrides both.
const env = { ...readEnvFiles(), ...process.env };
const url = env.PUBLIC_SUPABASE_URL ?? '';
const isLocalUrl = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url);

/** Whether to bring the local stack up, or leave this checkout pointed where it is. */
function shouldManageStack() {
	if (flag('--local')) return true;
	// CI has no Docker waiting for it, and the other two flags say so outright.
	if (flag('--hosted') || flag('--skip-db') || process.env.CI) return false;
	// A hosted URL means someone deliberately pointed this checkout elsewhere.
	return !url || isLocalUrl;
}

if (shouldManageStack()) prepareLocalStack();
else if (url && !isLocalUrl) console.log(`Pointed at ${url} — leaving the local stack alone.`);

startVite();
