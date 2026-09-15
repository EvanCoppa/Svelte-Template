import { describe, expect, it } from 'vitest';
import { stringify } from 'devalue';
import { isActionFailure } from '@sveltejs/kit';
import { ORG_ID, supabaseMockSequence, withStorage } from '$lib/server/crm/test-support';
import { recordPageActions } from './record-page';

const ASSET_ID = '80000000-0000-0000-0000-000000000001';

/**
 * The record page's photo upload, from the outside. A form holding a `File`
 * is what SvelteKit cannot send back — devalue refuses it and the browser
 * gets a 500 however well the upload went — so the action's exits go through
 * `withFiles()`, asserted here by serialising the payload the way SvelteKit
 * does rather than by looking for the helper.
 */

function harness() {
	const mock = withStorage(supabaseMockSequence([{ data: { id: 'i1', storage_path: 'p1' } }]));

	// superValidate demands a real Request — a duck-typed mock is treated as
	// plain data instead of being parsed as a multipart form post.
	const event = (file: File) => {
		const body = new FormData();
		body.set('file', file);
		body.set('caption', 'Front elevation');
		return {
			params: { id: ASSET_ID },
			locals: {
				supabase: mock.supabase,
				activeOrgId: ORG_ID,
				org: { access: { role: 'owner', grants: new Map() } }
			},
			request: new Request('https://app.test/assets/x', { method: 'POST', body })
		};
	};

	return { ...mock, event };
}

const actions = recordPageActions(() => 'asset');

function run(event: ReturnType<ReturnType<typeof harness>['event']>) {
	const action = actions.uploadImage;
	if (!action) throw new Error('the record page has no uploadImage action');
	// SAFETY: the stub carries every field the action reads (params, locals,
	// request); the rest of RequestEvent is irrelevant to it.
	return action(event as never);
}

/** What SvelteKit serialises: an `ActionFailure`'s data, or the result itself. */
function payload(result: Awaited<ReturnType<typeof run>>) {
	return isActionFailure(result) ? result.data : result;
}

describe('uploadImage', () => {
	it('stores the photo and returns a serialisable form', async () => {
		const h = harness();

		const result = await run(
			h.event(new File([new Uint8Array(8)], 'roof.png', { type: 'image/png' }))
		);

		expect(h.storageFrom).toHaveBeenCalledWith('entity-images');
		expect(h.bucket.upload).toHaveBeenCalled();
		expect(() => stringify(payload(result))).not.toThrow();
	});
});
