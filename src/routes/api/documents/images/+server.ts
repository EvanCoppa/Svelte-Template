import { json } from '@sveltejs/kit';
import {
	DOCUMENT_IMAGE_BUCKET,
	DOCUMENT_IMAGE_LIMIT,
	DOCUMENT_IMAGE_TYPES,
	documentImagePath,
	imageExtension,
	requireDocumentAccess
} from '$lib/server/documents';
import type { RequestHandler } from './$types';

/**
 * A picture dropped into a page.
 *
 * A `+server.ts` rather than a form action, and squarely inside CLAUDE.md's
 * exception: the request body is binary, born in JS memory when somebody
 * pastes or drops a file into the editor. There is no form to post.
 *
 * The reply shape is Editor.js's (`{ success, file: { url } }`) because that
 * is the contract its image tool speaks; the URL it gets back is this app's
 * own, not the storage host's, so it never expires and the bucket stays
 * private — see the GET beside this file.
 */
export const POST: RequestHandler = async (event) => {
	const { supabase, orgId } = await requireDocumentAccess(event, 'manage');

	const form = await event.request.formData().catch(() => null);
	const file = form?.get('image');
	// Editor.js reports `success: 0` to the user as a failed upload, which is
	// what these are: a refusal to fix, not a server fault.
	if (!(file instanceof File)) {
		return json({ success: 0, message: 'No image was uploaded.' }, { status: 400 });
	}
	if (file.size > DOCUMENT_IMAGE_LIMIT) {
		return json({ success: 0, message: 'That image is larger than 10 MB.' }, { status: 400 });
	}
	const extension = imageExtension(file.type);
	if (!extension || !DOCUMENT_IMAGE_TYPES.some((type) => type === file.type)) {
		return json({ success: 0, message: 'Images can be PNG, JPEG, GIF or WebP.' }, { status: 400 });
	}

	// A name of our own: an uploaded filename is the uploader's text, and
	// putting it in a path is how a traversal or an overwrite gets in.
	const name = `${crypto.randomUUID()}.${extension}`;
	const path = documentImagePath(orgId, name);

	const { error: uploadError } = await supabase.storage
		.from(DOCUMENT_IMAGE_BUCKET)
		.upload(path, file, { contentType: file.type, upsert: false });
	if (uploadError) {
		return json({ success: 0, message: 'That image could not be saved.' }, { status: 400 });
	}

	return json({ success: 1, file: { url: `/api/documents/images/${path}` } });
};
