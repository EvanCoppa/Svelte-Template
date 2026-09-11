import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import type { CrmEntityRef } from './entity';
import { unwrap } from './unwrap';

/**
 * Data access for `entity_images` — pictures attached to a record through
 * the shared polymorphic link, the way `addresses.ts` attaches a location.
 * Today the database pins it to assets (`entity_images_entity_is_asset`),
 * so this module is asset-only until that constraint is widened.
 *
 * Unlike every other CRM table, a row here has a byte payload living outside
 * Postgres: `storage_path` names an object in the private `entity-images`
 * Storage bucket (see the entity_images migration for its RLS), under
 * `{org_id}/{entity_type}/{entity_id}/{filename}`. A read hands back a short-
 * lived signed URL rather than the path itself — nothing durable is ever
 * cached across requests — and a delete removes the storage object first,
 * so a row is never left pointing at nothing, and never orphans a file.
 */

export type EntityImage = Tables<'entity_images'>;

/** A row plus the signed URL the browser actually loads. */
export type EntityImageWithUrl = EntityImage & { url: string };

const BUCKET = 'entity-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** An image's storage object never changes extension after upload. */
function extensionFor(file: File): string {
	const fromName = file.name.split('.').pop();
	if (fromName && fromName.length <= 5) return fromName.toLowerCase();
	return file.type.split('/').pop() ?? 'bin';
}

function pathFor(orgId: string, entity: CrmEntityRef, file: File): string {
	return `${orgId}/${entity.entityType}/${entity.entityId}/${crypto.randomUUID()}.${extensionFor(file)}`;
}

/** A record's images, newest first, each with a signed URL good for an hour. */
export async function listEntityImages(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef
): Promise<EntityImageWithUrl[]> {
	const rows = unwrap(
		await supabase
			.from('entity_images')
			.select('*')
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
			.order('created_at', { ascending: false })
	);
	if (rows.length === 0) return [];

	const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrls(
		rows.map((row) => row.storage_path),
		SIGNED_URL_TTL_SECONDS
	);
	if (error) throw new Error(error.message, { cause: error });

	const urlByPath = new Map(signed.map((entry) => [entry.path, entry.signedUrl]));
	return rows.map((row) => ({ ...row, url: urlByPath.get(row.storage_path) ?? '' }));
}

/** Uploads the file to storage, then rows it. The upload is undone if the row fails. */
export async function createEntityImage(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef,
	values: { file: File; caption: string | null }
): Promise<EntityImage> {
	const path = pathFor(orgId, entity, values.file);
	const uploaded = await supabase.storage
		.from(BUCKET)
		.upload(path, values.file, { contentType: values.file.type });
	if (uploaded.error) throw new Error(uploaded.error.message, { cause: uploaded.error });

	try {
		return unwrap(
			await supabase
				.from('entity_images')
				.insert({
					org_id: orgId,
					entity_type: entity.entityType,
					entity_id: entity.entityId,
					storage_path: path,
					caption: values.caption
				})
				.select()
				.single()
		);
	} catch (cause) {
		await supabase.storage.from(BUCKET).remove([path]);
		throw cause;
	}
}

export async function updateEntityImageCaption(
	supabase: SupabaseClient<Database>,
	orgId: string,
	imageId: string,
	caption: string | null
): Promise<EntityImage> {
	return unwrap(
		await supabase
			.from('entity_images')
			.update({ caption })
			.eq('org_id', orgId)
			.eq('id', imageId)
			.select()
			.single()
	);
}

/** Deletes the row, then its storage object — RLS refuses a non-owner/admin before either happens. */
export async function deleteEntityImage(
	supabase: SupabaseClient<Database>,
	orgId: string,
	imageId: string
): Promise<void> {
	const result = await supabase
		.from('entity_images')
		.delete()
		.eq('org_id', orgId)
		.eq('id', imageId)
		.select('id, storage_path');
	const deleted = unwrap(result);
	if (deleted.length === 0) {
		throw new Error('Image was not deleted: it does not exist, or you are not allowed to.');
	}
	const removed = await supabase.storage.from(BUCKET).remove([deleted[0].storage_path]);
	if (removed.error) throw new Error(removed.error.message, { cause: removed.error });
}
