import { error, json } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/roles';
import type { RequestHandler } from './$types';

/**
 * Upload one image for a slide. A `+server.ts`, not a form action, because
 * the body is a file the builder sends on its own (CLAUDE.md's "request
 * bodies born in JS memory" exception); the deck itself is saved by the
 * page's form action. The file lands in the public `slides` bucket under
 * the org's folder, where the bucket policies (the org_slides migration)
 * let members write and nobody write into another org's folder, and the
 * public URL is what the deck stores.
 */

const BUCKET = 'slides';
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Map([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/webp', 'webp'],
	['image/gif', 'gif']
]);

export const POST: RequestHandler = async ({ request, locals }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw error(401, 'Not signed in.');
	requirePermission(org.access, 'proposals', 'manage');

	const file = (await request.formData().catch(() => null))?.get('file');
	if (!(file instanceof File)) throw error(400, 'Expected a file.');
	const extension = TYPES.get(file.type);
	if (!extension) throw error(400, 'Use a JPEG, PNG, WebP or GIF image.');
	if (file.size > MAX_BYTES) throw error(400, 'Keep images under 10 MB.');

	const path = `${activeOrgId}/${crypto.randomUUID()}.${extension}`;
	const { error: uploadError } = await supabase.storage
		.from(BUCKET)
		.upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
	if (uploadError) throw error(500, 'The image could not be uploaded.');

	return json({ url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
};
