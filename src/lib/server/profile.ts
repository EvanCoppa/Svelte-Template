import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import type { AvatarTone } from '$lib/components/ui/avatar/index.js';
import { unwrap } from './crm/unwrap';

/**
 * The signed-in user's own profile, and the four ways they can answer "what
 * do I look like" (see the profile_photos migration). Data access for a
 * settings page rather than a CRM table, so it sits beside `staff.ts` rather
 * than in `crm/`, but it follows the same contract: routes call these, never
 * an ad-hoc `.from()` of their own.
 *
 * Like `crm/entity-images.ts`, a row here has a byte payload living outside
 * Postgres — an uploaded photo is an object in the public `avatars` bucket
 * under `{user_id}/{filename}`, and `avatar_url` is its public URL. The one
 * rule that keeps the two in step: whatever replaces a photo (another
 * upload, a generated avatar, initials) removes the object the old URL
 * pointed at, so the bucket never accumulates a file nothing references.
 */

export type Profile = Tables<'profiles'>;

const BUCKET = 'avatars';

/** Mirrors the schema's `ACCEPTED_AVATAR_TYPES` — re-checked here, off the browser's path. */
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;

/** A public object's URL ends `/object/public/{bucket}/{path}` — this is the inverse. */
export function avatarObjectPath(url: string | null): string | null {
	if (!url) return null;
	const marker = `/object/public/${BUCKET}/`;
	const at = url.indexOf(marker);
	if (at === -1) return null;
	const path = url.slice(at + marker.length).split('?')[0];
	return path === '' ? null : decodeURIComponent(path);
}

function extensionFor(file: File): string {
	const fromName = file.name.split('.').pop();
	if (fromName && /^[a-z0-9]{1,5}$/i.test(fromName)) return fromName.toLowerCase();
	return file.type.split('/').pop() ?? 'bin';
}

export async function getProfile(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<Profile | null> {
	const { data, error } = await supabase
		.from('profiles')
		.select('*')
		.eq('id', userId)
		.maybeSingle();
	// Tolerated rather than thrown: a clone that has not applied the starter
	// migration yet should render a hint, not a 500.
	if (error) {
		console.warn('[profile] lookup failed', error.message);
		return null;
	}
	return data;
}

/**
 * Points the profile at a photo, and clears up whatever it pointed at
 * before. The removal is best-effort on purpose: the row is the fact, and a
 * bucket object that outlives it is litter rather than a broken screen.
 */
async function setAvatar(
	supabase: SupabaseClient<Database>,
	userId: string,
	values: { avatar_url: string | null; avatar_tint?: AvatarTone | null }
): Promise<Profile> {
	const previous = avatarObjectPath((await getProfile(supabase, userId))?.avatar_url ?? null);

	const saved = unwrap(
		await supabase.from('profiles').update(values).eq('id', userId).select().single()
	);

	if (previous && previous !== avatarObjectPath(saved.avatar_url)) {
		const removed = await supabase.storage.from(BUCKET).remove([previous]);
		if (removed.error) console.warn('[profile] old avatar not removed', removed.error.message);
	}
	return saved;
}

/** Uploads the file, then points the profile at it. A failed save takes the upload with it. */
export async function uploadAvatar(
	supabase: SupabaseClient<Database>,
	userId: string,
	file: File
): Promise<Profile> {
	// The schema already said this; a request that skipped the browser did not.
	if (file.size === 0 || file.size > MAX_BYTES || !ACCEPTED_TYPES.has(file.type)) {
		throw new Error('That file is not a photo we can use.');
	}

	// The first path segment is the owner's id — the storage policies key off
	// it, so this shape is load-bearing, not just a convention.
	const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file)}`;
	const uploaded = await supabase.storage.from(BUCKET).upload(path, file, {
		contentType: file.type
	});
	if (uploaded.error) throw new Error(uploaded.error.message, { cause: uploaded.error });

	try {
		const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
		return await setAvatar(supabase, userId, { avatar_url: data.publicUrl });
	} catch (cause) {
		await supabase.storage.from(BUCKET).remove([path]);
		throw cause;
	}
}

/**
 * Points the profile at an image someone else hosts — a generated avatar, a
 * Gravatar. The caller has already checked the URL against the allowlist in
 * the page's schema; nothing is fetched here, because the browser is what
 * loads it and the CSP is what decides whether it may.
 */
export async function useAvatarUrl(
	supabase: SupabaseClient<Database>,
	userId: string,
	url: string
): Promise<Profile> {
	return setAvatar(supabase, userId, { avatar_url: url });
}

/** Drops the photo and keeps the initials, in the colour they chose. */
export async function useInitialsAvatar(
	supabase: SupabaseClient<Database>,
	userId: string,
	tint: AvatarTone
): Promise<Profile> {
	return setAvatar(supabase, userId, { avatar_url: null, avatar_tint: tint });
}

/**
 * Gravatar hashes an email two ways: SHA-256 since 2024, MD5 before it, and
 * both still resolve. `?d=404` is what turns "give me a default face" into
 * "say whether this address has one".
 */
export function gravatarHashes(email: string) {
	const normalized = email.trim().toLowerCase();
	return {
		sha256: createHash('sha256').update(normalized).digest('hex'),
		md5: createHash('md5').update(normalized).digest('hex')
	};
}

export function gravatarUrl(hash: string, size = 200): string {
	return `https://gravatar.com/avatar/${hash}?s=${size}`;
}

/**
 * Just enough of `fetch` to ask whether a URL is there: the load passes
 * SvelteKit's own, and a test passes a stub without having to widen it back
 * to the whole Fetch API.
 */
type ProbeFetch = (url: string, init: RequestInit) => Promise<{ ok: boolean }>;

/**
 * The hash of the caller's Gravatar, or null when they have none. Probed on
 * the server because the CSP's `connect-src` does not admit gravatar.com —
 * only `img-src` does, and an image cannot report a 404 back to the page.
 * Capped at two seconds so an unreachable gravatar.com costs the tab it
 * belongs on and not the page load.
 */
export async function findGravatarHash(
	email: string | undefined,
	fetcher: ProbeFetch = fetch
): Promise<string | null> {
	if (!email) return null;
	const { sha256, md5 } = gravatarHashes(email);

	const probe = async (hash: string): Promise<boolean> => {
		const response = await fetcher(`https://gravatar.com/avatar/${hash}?d=404`, {
			method: 'HEAD',
			redirect: 'follow',
			signal: AbortSignal.timeout(2000)
		});
		return response.ok;
	};

	try {
		const [modern, legacy] = await Promise.all([probe(sha256), probe(md5)]);
		if (modern) return sha256;
		if (legacy) return md5;
	} catch {
		// Offline, blocked, or slower than the cap: the tab says "no Gravatar
		// found", which is the same thing the reader can act on.
	}
	return null;
}
