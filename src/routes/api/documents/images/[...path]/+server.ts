import { error } from '@sveltejs/kit';
import { DOCUMENT_IMAGE_BUCKET, requireDocumentAccess } from '$lib/server/documents';
import type { RequestHandler } from './$types';

/**
 * Serves one page's picture.
 *
 * The bucket is private, unlike `product-images`: a storefront photo is meant
 * for anybody, and a screenshot of an account's rate sheet is not. So the
 * bytes come back through the app rather than from a storage URL, and three
 * things follow, all of them wanted:
 *
 *   - the URL in the body never expires, so a page written last year still
 *     shows its pictures (a signed URL would not)
 *   - `img-src 'self'` covers it, so the CSP needs no new origin
 *   - the read goes through the caller's own client, so the storage policy —
 *     "a member of the org whose folder this is" — is what answers, not code
 *     here that could forget to ask
 */
export const GET: RequestHandler = async (event) => {
	// `read` and not `manage`: looking at a page is not editing one.
	const { supabase } = await requireDocumentAccess(event, 'read');

	const path = event.params.path;
	// The storage policy checks the first folder against the caller's
	// membership, so a path climbing out of it finds nothing — but there is no
	// reason to send one at all.
	if (!path || path.includes('..')) throw error(404, 'Not found.');

	const { data, error: downloadError } = await supabase.storage
		.from(DOCUMENT_IMAGE_BUCKET)
		.download(path);
	if (downloadError || !data) throw error(404, 'Not found.');

	return new Response(data, {
		headers: {
			'Content-Type': data.type || 'application/octet-stream',
			'Content-Length': String(data.size),
			// Private: it is one org's picture, so a shared cache must never
			// hold it. Immutable because the name is a fresh uuid per upload.
			'Cache-Control': 'private, max-age=31536000, immutable'
		}
	});
};
