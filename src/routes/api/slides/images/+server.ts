import { error, json } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/roles';
import type { RequestHandler } from './$types';

/**
 * Upload one image — or one video, for a slot that takes one — for a slide.
 * A `+server.ts`, not a form action, because
 * the body is a file the builder sends on its own (CLAUDE.md's "request
 * bodies born in JS memory" exception); the deck itself is saved by the
 * page's form action. The file lands in the public `slides` bucket under
 * the org's folder, where the bucket policies (the org_slides migration)
 * let members write and nobody write into another org's folder, and the
 * public URL is what the deck stores.
 */

const BUCKET = 'slides';
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** Accepted types, the extension each is stored under, and how big it may be. */
const TYPES = new Map([
	['image/jpeg', { extension: 'jpg', maxBytes: IMAGE_MAX_BYTES }],
	['image/png', { extension: 'png', maxBytes: IMAGE_MAX_BYTES }],
	['image/webp', { extension: 'webp', maxBytes: IMAGE_MAX_BYTES }],
	['image/gif', { extension: 'gif', maxBytes: IMAGE_MAX_BYTES }],
	['video/mp4', { extension: 'mp4', maxBytes: VIDEO_MAX_BYTES }],
	['video/webm', { extension: 'webm', maxBytes: VIDEO_MAX_BYTES }],
	['video/quicktime', { extension: 'mov', maxBytes: VIDEO_MAX_BYTES }]
]);

export const POST: RequestHandler = async ({ request, locals }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw error(401, 'Not signed in.');
	requirePermission(org.access, 'proposals', 'manage');

	const file = (await request.formData().catch(() => null))?.get('file');
	if (!(file instanceof File)) throw error(400, 'Expected a file.');
	const type = TYPES.get(file.type);
	if (!type) throw error(400, 'Use a JPEG, PNG, WebP or GIF image, or an MP4, WebM or MOV video.');
	if (file.size > type.maxBytes) {
		throw error(
			400,
			file.type.startsWith('video/') ? 'Keep videos under 50 MB.' : 'Keep images under 10 MB.'
		);
	}

	const path = `${activeOrgId}/${crypto.randomUUID()}.${type.extension}`;
	const { error: uploadError } = await supabase.storage
		.from(BUCKET)
		.upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
	if (uploadError) throw error(500, 'The file could not be uploaded.');

	return json({ url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
};
