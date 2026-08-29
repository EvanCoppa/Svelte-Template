/**
 * Minimal .env reader, shared by the tooling that has to know which Supabase
 * project this checkout is pointed at (scripts/gen-db-types.mjs, tests/env.ts).
 *
 * Deliberately tiny: the app itself never uses this — Vite loads .env files
 * into `$env/*` on its own. This exists only for Node scripts running outside
 * Vite, so it mirrors Vite's precedence rather than inventing its own.
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * @param {string} path
 * @returns {Record<string, string>}
 */
export function readDotEnv(path) {
	if (!existsSync(path)) return {};
	/** @type {Record<string, string>} */
	const env = {};
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
	}
	return env;
}

/**
 * Vite's precedence: .env first, then .env.local overriding it. The real
 * environment wins over both, so callers layer `process.env` on top.
 *
 * @returns {Record<string, string>}
 */
export function readEnvFiles() {
	return { ...readDotEnv('.env'), ...readDotEnv('.env.local') };
}
