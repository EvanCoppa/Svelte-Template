import { describe, expect, it } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import { actions, load } from './+page.server';
import { supabaseMockSequence, withStorage } from '$lib/server/crm/test-support';

/**
 * The photo actions from the outside. What matters here is the boundary the
 * page owns: which posts are refused before anything is written, and that a
 * valid one reaches the column. The storage/cleanup mechanics are
 * `$lib/server/profile`'s own tests.
 */

const USER_ID = '00000000-0000-0000-0000-000000000002';
const PUBLIC = 'https://stack.test/storage/v1/object/public/avatars';

function harness(previous: string | null = null) {
	const mock = withStorage(
		supabaseMockSequence([
			{ data: { id: USER_ID, avatar_url: previous, avatar_tint: null } },
			{ data: { id: USER_ID, avatar_url: null, avatar_tint: null } }
		]),
		{ publicUrl: `${PUBLIC}/${USER_ID}/new.png` }
	);
	const locals = { supabase: mock.supabase, user: { id: USER_ID, email: 'evan@example.com' } };
	return {
		...mock,
		// superValidate demands a real Request — a duck-typed mock is treated
		// as plain data instead of being parsed as a form post.
		post(body: FormData) {
			// SAFETY: the actions read locals and request only; the rest of
			// RequestEvent is irrelevant to them.
			return {
				locals,
				request: new Request('https://app.test/settings/profile', { method: 'POST', body })
			} as never;
		}
	};
}

function form(entries: [string, string | File][]) {
	const body = new FormData();
	for (const [name, value] of entries) body.append(name, value);
	return body;
}

function photo(name = 'me.png', type = 'image/png') {
	return new File(['bytes'], name, { type });
}

describe('the profile page load', () => {
	it('reads the profile from the layout rather than querying it again', async () => {
		const mock = harness();
		const profile = { id: USER_ID, display_name: 'Evan', avatar_url: null, avatar_tint: null };

		// SAFETY: the load reads `user`, `parent` and `fetch` only.
		const data = await load({
			locals: { user: { id: USER_ID, email: undefined } },
			parent: async () => ({ profile }),
			fetch: async () => new Response(null, { status: 404 })
		} as never);

		expect(mock.from).not.toHaveBeenCalled();
		expect(data?.profileForm.data.display_name).toBe('Evan');
		// No email on the user, so there is nothing to probe Gravatar with.
		expect(data?.gravatarUrl).toBeNull();
	});
});

describe('uploadAvatar', () => {
	it('saves the photo and points the profile at its public URL', async () => {
		const harnessed = harness();

		const result = await actions.uploadAvatar(harnessed.post(form([['file', photo()]])));

		expect(isActionFailure(result)).toBe(false);
		expect(harnessed.builder.update).toHaveBeenCalledWith({
			avatar_url: `${PUBLIC}/${USER_ID}/new.png`
		});
	});

	it('refuses a file that is not an image, before it reaches storage', async () => {
		const harnessed = harness();
		const pdf = new File(['bytes'], 'resume.pdf', { type: 'application/pdf' });

		const result = await actions.uploadAvatar(harnessed.post(form([['file', pdf]])));

		expect(isActionFailure(result)).toBe(true);
		expect(harnessed.bucket.upload).not.toHaveBeenCalled();
	});

	it('refuses an empty submit rather than blanking the photo', async () => {
		const harnessed = harness();

		const result = await actions.uploadAvatar(harnessed.post(form([])));

		expect(isActionFailure(result)).toBe(true);
		expect(harnessed.bucket.upload).not.toHaveBeenCalled();
	});
});

describe('useAvatarUrl', () => {
	it('accepts a generated avatar from the allowlisted host', async () => {
		const harnessed = harness();
		const url = 'https://api.dicebear.com/9.x/thumbs/svg?seed=abc';

		const result = await actions.useAvatarUrl(harnessed.post(form([['url', url]])));

		expect(isActionFailure(result)).toBe(false);
		expect(harnessed.builder.update).toHaveBeenCalledWith({ avatar_url: url });
	});

	it('accepts a Gravatar', async () => {
		const harnessed = harness();
		const url = 'https://gravatar.com/avatar/abc?s=200';

		await actions.useAvatarUrl(harnessed.post(form([['url', url]])));

		expect(harnessed.builder.update).toHaveBeenCalledWith({ avatar_url: url });
	});

	it.each([
		['a host nobody allowlisted', 'https://evil.test/pixel.gif'],
		// The allowlist matches the whole hostname, so a lookalike subdomain
		// registered by someone else is not gravatar.com.
		['a lookalike subdomain', 'https://gravatar.com.evil.test/a.png'],
		['plain http', 'http://gravatar.com/avatar/abc'],
		['something that is not a URL', 'javascript:alert(1)']
	])('refuses %s', async (_case, url) => {
		const harnessed = harness();

		const result = await actions.useAvatarUrl(harnessed.post(form([['url', url]])));

		expect(isActionFailure(result)).toBe(true);
		expect(harnessed.builder.update).not.toHaveBeenCalled();
	});
});

describe('useInitials', () => {
	it('clears the photo and stores the colour', async () => {
		const harnessed = harness();

		const result = await actions.useInitials(harnessed.post(form([['tint', 'violet']])));

		expect(isActionFailure(result)).toBe(false);
		expect(harnessed.builder.update).toHaveBeenCalledWith({
			avatar_url: null,
			avatar_tint: 'violet'
		});
	});

	it('refuses a colour outside the palette the column accepts', async () => {
		const harnessed = harness();

		const result = await actions.useInitials(harnessed.post(form([['tint', 'chartreuse']])));

		expect(isActionFailure(result)).toBe(true);
		expect(harnessed.builder.update).not.toHaveBeenCalled();
	});
});
