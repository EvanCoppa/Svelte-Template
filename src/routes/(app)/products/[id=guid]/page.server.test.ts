import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stringify } from 'devalue';
import { isActionFailure } from '@sveltejs/kit';
import {
	ORG_ID,
	PUBLIC_BUCKET_URL,
	supabaseMockSequence,
	withStorage,
	type StorageResult
} from '$lib/server/crm/test-support';
import { actions } from './+page.server';

const PRODUCT_ID = '70000000-0000-0000-0000-000000000001';

/**
 * A form holding a `File` is what SvelteKit cannot send back: devalue refuses
 * it, and the browser gets a 500 ("Internal Error") however well the upload
 * went — which is what `withFiles()` in the action is there to prevent. Each
 * exit is asserted by actually serialising the payload the way SvelteKit
 * does, rather than by looking for the helper that strips the file.
 */

function harness(storage: StorageResult = {}, imageUrl: string | null = null) {
	const mock = withStorage(
		supabaseMockSequence([
			// `getProduct()` — the row as it stands before the upload…
			{ data: { id: PRODUCT_ID, image_url: imageUrl } },
			// …then `updateProduct()` pointing `image_url` at the new object.
			{ data: { id: PRODUCT_ID } }
		]),
		storage
	);

	// superValidate demands a real Request — a duck-typed mock is treated as
	// plain data instead of being parsed as a multipart form post.
	const event = (file: File) => {
		const body = new FormData();
		body.set('file', file);
		return {
			params: { id: PRODUCT_ID },
			locals: {
				supabase: mock.supabase,
				activeOrgId: ORG_ID,
				org: { access: { role: 'owner', grants: new Map() } }
			},
			request: new Request('https://app.test/products/x', { method: 'POST', body })
		};
	};

	return { ...mock, event };
}

type StubEvent = ReturnType<ReturnType<typeof harness>['event']>;

function run(event: StubEvent) {
	const action = actions.uploadProductImage;
	if (!action) throw new Error('the product page has no uploadProductImage action');
	// SAFETY: the stub carries every field the action reads (params, locals,
	// request); the rest of RequestEvent is irrelevant to it.
	return action(event as never);
}

/** What SvelteKit serialises: an `ActionFailure`'s data, or the result itself. */
function payload(result: Awaited<ReturnType<typeof run>>) {
	return isActionFailure(result) ? result.data : result;
}

const png = () => new File([new Uint8Array(8)], 'shingle.png', { type: 'image/png' });

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('uploadProductImage', () => {
	it('stores the file under the org and returns a serialisable form', async () => {
		const h = harness();

		const result = await run(h.event(png()));

		expect(h.storageFrom).toHaveBeenCalledWith('product-images');
		const [path, file] = h.bucket.upload.mock.calls[0];
		expect(path.startsWith(`${ORG_ID}/${PRODUCT_ID}/`)).toBe(true);
		expect(path.endsWith('.png')).toBe(true);
		expect(file.type).toBe('image/png');
		expect(h.builder.update).toHaveBeenCalledWith({
			image_url: `${PUBLIC_BUCKET_URL}/${path}`
		});
		expect(() => stringify(payload(result))).not.toThrow();
	});

	it('removes the object the product pointed at before', async () => {
		const previous = `${PUBLIC_BUCKET_URL}/product-images/${ORG_ID}/${PRODUCT_ID}/old.png`;
		const h = harness({}, previous);

		await run(h.event(png()));

		expect(h.bucket.remove).toHaveBeenCalledWith([`${ORG_ID}/${PRODUCT_ID}/old.png`]);
	});

	it('returns a serialisable failure when the file is rejected', async () => {
		const h = harness();

		const result = await run(h.event(new File([], 'empty.png', { type: 'image/png' })));

		expect(isActionFailure(result)).toBe(true);
		expect(h.bucket.upload).not.toHaveBeenCalled();
		expect(() => stringify(payload(result))).not.toThrow();
	});

	it('reports a refused upload inline instead of erroring', async () => {
		const h = harness({ upload: { error: { message: 'new row violates row-level security' } } });

		const result = await run(h.event(png()));

		expect(isActionFailure(result)).toBe(true);
		expect(() => stringify(payload(result))).not.toThrow();
	});
});
