import { describe, expect, it, vi } from 'vitest';
import type { Profile } from './profile';
import {
	avatarObjectPath,
	findGravatarHash,
	gravatarHashes,
	uploadAvatar,
	useAvatarUrl,
	useInitialsAvatar
} from './profile';
import { supabaseMockSequence, withStorage } from './crm/test-support';

/**
 * `profile.ts` from the outside: the three doors to a photo all end in the
 * same two columns, an upload that cannot be saved takes its file back out of
 * the bucket, whatever the profile pointed at before is cleaned up, and the
 * Gravatar probe prefers the modern hash without letting a slow gravatar.com
 * become a failed page load.
 */

const USER_ID = '00000000-0000-0000-0000-000000000002';
const PUBLIC = 'https://stack.test/storage/v1/object/public/avatars';

function photo(name = 'me.png', type = 'image/png') {
	return new File(['bytes'], name, { type });
}

/** A read of the current row, then the update that replaces it. */
function profileMock(
	previous: string | null,
	saved: Partial<Pick<Profile, 'avatar_url' | 'avatar_tint'>> = {}
) {
	return withStorage(
		supabaseMockSequence([
			{ data: { id: USER_ID, avatar_url: previous, avatar_tint: null } },
			{ data: { id: USER_ID, avatar_url: null, avatar_tint: null, ...saved } }
		]),
		{ publicUrl: `${PUBLIC}/${USER_ID}/new.png` }
	);
}

describe('avatarObjectPath', () => {
	it('recovers the object path from a public URL in our bucket', () => {
		expect(avatarObjectPath(`${PUBLIC}/${USER_ID}/a.png`)).toBe(`${USER_ID}/a.png`);
	});

	it('ignores a cache-busting query and decodes an escaped name', () => {
		expect(avatarObjectPath(`${PUBLIC}/${USER_ID}/my%20face.png?t=1`)).toBe(
			`${USER_ID}/my face.png`
		);
	});

	it('is null for a URL we do not host, and for no URL at all', () => {
		expect(avatarObjectPath('https://api.dicebear.com/9.x/thumbs/svg?seed=x')).toBeNull();
		expect(avatarObjectPath(null)).toBeNull();
	});
});

describe('uploadAvatar', () => {
	it('files the photo under the owner’s id and saves its public URL', async () => {
		const mock = profileMock(null, { avatar_url: `${PUBLIC}/${USER_ID}/new.png` });

		await uploadAvatar(mock.supabase, USER_ID, photo());

		const [path, file, options] = mock.bucket.upload.mock.calls[0];
		// The storage policies key off the first path segment, so this shape is
		// the boundary, not a convention.
		expect(path.startsWith(`${USER_ID}/`)).toBe(true);
		expect(path.endsWith('.png')).toBe(true);
		expect(file).toBeInstanceOf(File);
		expect(options).toEqual({ contentType: 'image/png' });
		expect(mock.builder.update).toHaveBeenCalledWith({
			avatar_url: `${PUBLIC}/${USER_ID}/new.png`
		});
	});

	it('refuses a file the schema would have refused, without touching storage', async () => {
		const mock = profileMock(null);
		const pdf = new File(['bytes'], 'resume.pdf', { type: 'application/pdf' });

		await expect(uploadAvatar(mock.supabase, USER_ID, pdf)).rejects.toThrow(/not a photo/i);
		expect(mock.bucket.upload).not.toHaveBeenCalled();
	});

	it('takes the upload back out of the bucket when the row will not save', async () => {
		const mock = withStorage(supabaseMockSequence([{ error: { message: 'nope' } }]), {
			publicUrl: `${PUBLIC}/${USER_ID}/new.png`
		});

		await expect(uploadAvatar(mock.supabase, USER_ID, photo())).rejects.toThrow('nope');
		const uploaded = mock.bucket.upload.mock.calls[0][0];
		expect(mock.bucket.remove).toHaveBeenCalledWith([uploaded]);
	});

	it('removes the photo the profile pointed at before', async () => {
		const mock = profileMock(`${PUBLIC}/${USER_ID}/old.png`, {
			avatar_url: `${PUBLIC}/${USER_ID}/new.png`
		});

		await uploadAvatar(mock.supabase, USER_ID, photo());

		expect(mock.bucket.remove).toHaveBeenCalledWith([`${USER_ID}/old.png`]);
	});
});

describe('useAvatarUrl', () => {
	it('stores the URL and drops the uploaded photo it replaces', async () => {
		const generated = 'https://api.dicebear.com/9.x/thumbs/svg?seed=abc';
		const mock = profileMock(`${PUBLIC}/${USER_ID}/old.png`, { avatar_url: generated });

		await useAvatarUrl(mock.supabase, USER_ID, generated);

		expect(mock.builder.update).toHaveBeenCalledWith({ avatar_url: generated });
		expect(mock.bucket.remove).toHaveBeenCalledWith([`${USER_ID}/old.png`]);
	});

	it('leaves the bucket alone when there was no uploaded photo', async () => {
		const mock = profileMock('https://gravatar.com/avatar/abc?s=200');

		await useAvatarUrl(mock.supabase, USER_ID, 'https://gravatar.com/avatar/abc?s=200');

		expect(mock.bucket.remove).not.toHaveBeenCalled();
	});
});

describe('useInitialsAvatar', () => {
	it('clears the photo, keeps the colour, and cleans up the old file', async () => {
		const mock = profileMock(`${PUBLIC}/${USER_ID}/old.png`);

		await useInitialsAvatar(mock.supabase, USER_ID, 'violet');

		expect(mock.builder.update).toHaveBeenCalledWith({
			avatar_url: null,
			avatar_tint: 'violet'
		});
		expect(mock.bucket.remove).toHaveBeenCalledWith([`${USER_ID}/old.png`]);
	});
});

describe('gravatar', () => {
	it('hashes the normalized address both ways', () => {
		expect(gravatarHashes('  Evan@Example.COM ')).toEqual(gravatarHashes('evan@example.com'));
	});

	it('prefers the SHA-256 hash when Gravatar knows the address', async () => {
		const { sha256 } = gravatarHashes('evan@example.com');
		const fetcher = vi.fn(async () => new Response(null, { status: 200 }));

		await expect(findGravatarHash('evan@example.com', fetcher)).resolves.toBe(sha256);
	});

	it('falls back to the legacy MD5 hash when only that one resolves', async () => {
		const { sha256, md5 } = gravatarHashes('evan@example.com');
		const fetcher = vi.fn(async (url: string) =>
			url.includes(sha256)
				? new Response(null, { status: 404 })
				: new Response(null, { status: 200 })
		);

		await expect(findGravatarHash('evan@example.com', fetcher)).resolves.toBe(md5);
	});

	it('answers null — never throws — when gravatar.com cannot be reached', async () => {
		const fetcher = vi.fn(async () => {
			throw new Error('timed out');
		});

		await expect(findGravatarHash('evan@example.com', fetcher)).resolves.toBeNull();
	});

	it('does not probe at all for a user with no email', async () => {
		const fetcher = vi.fn();
		await expect(findGravatarHash(undefined, fetcher)).resolves.toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
	});
});
