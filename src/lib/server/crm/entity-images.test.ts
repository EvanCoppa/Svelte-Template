import { describe, expect, it } from 'vitest';
import {
	createEntityImage,
	deleteEntityImage,
	listEntityImages,
	updateEntityImageCaption
} from './entity-images';
import { ORG_ID, supabaseMock, withStorage } from './test-support';

/**
 * `entity-images.ts` from the outside: a list merges the signed URLs storage
 * hands back, a create undoes its upload when the row fails, and a delete
 * only reaches into storage once the row is actually gone (RLS's zero-row
 * refusal never touches the file).
 */

const ASSET_ID = '40000000-0000-0000-0000-000000000004';
const ENTITY = { entityType: 'asset' as const, entityId: ASSET_ID };

function file(name = 'photo.jpg', type = 'image/jpeg') {
	return new File(['bytes'], name, { type });
}

describe('entity images data access', () => {
	it('returns no images, and makes no storage call, when the record has none', async () => {
		const mock = withStorage(supabaseMock({ data: [] }));

		await expect(listEntityImages(mock.supabase, ORG_ID, ENTITY)).resolves.toEqual([]);
		expect(mock.bucket.createSignedUrls).not.toHaveBeenCalled();
	});

	it('lists a record’s images with each one’s signed URL merged in', async () => {
		const rows = [
			{ id: 'i1', storage_path: `${ORG_ID}/asset/${ASSET_ID}/a.jpg`, caption: 'Front' },
			{ id: 'i2', storage_path: `${ORG_ID}/asset/${ASSET_ID}/b.jpg`, caption: null }
		];
		const mock = withStorage(supabaseMock({ data: rows }), {
			createSignedUrls: {
				data: [
					{ path: rows[0].storage_path, signedUrl: 'https://signed/a' },
					{ path: rows[1].storage_path, signedUrl: 'https://signed/b' }
				]
			}
		});

		const result = await listEntityImages(mock.supabase, ORG_ID, ENTITY);
		expect(result).toEqual([
			{ ...rows[0], url: 'https://signed/a' },
			{ ...rows[1], url: 'https://signed/b' }
		]);
		expect(mock.from).toHaveBeenCalledWith('entity_images');
		expect(mock.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(mock.builder.eq).toHaveBeenCalledWith('entity_type', 'asset');
		expect(mock.builder.eq).toHaveBeenCalledWith('entity_id', ASSET_ID);
		expect(mock.storageFrom).toHaveBeenCalledWith('entity-images');
		expect(mock.bucket.createSignedUrls).toHaveBeenCalledWith(
			[rows[0].storage_path, rows[1].storage_path],
			60 * 60
		);
	});

	it('falls back to an empty URL for a row storage did not sign', async () => {
		const rows = [{ id: 'i1', storage_path: 'p1', caption: null }];
		const mock = withStorage(supabaseMock({ data: rows }), {
			createSignedUrls: { data: [] }
		});

		const result = await listEntityImages(mock.supabase, ORG_ID, ENTITY);
		expect(result).toEqual([{ ...rows[0], url: '' }]);
	});

	it('throws when signing fails', async () => {
		const rows = [{ id: 'i1', storage_path: 'p1', caption: null }];
		const mock = withStorage(supabaseMock({ data: rows }), {
			createSignedUrls: { error: { message: 'signing failed' } }
		});

		await expect(listEntityImages(mock.supabase, ORG_ID, ENTITY)).rejects.toThrow('signing failed');
	});

	it('uploads before inserting, and rows the upload’s own path', async () => {
		const mock = withStorage(supabaseMock({ data: { id: 'i1', caption: 'Front' } }));

		await createEntityImage(mock.supabase, ORG_ID, ENTITY, { file: file(), caption: 'Front' });

		expect(mock.bucket.upload).toHaveBeenCalledTimes(1);
		const [path, uploadedFile, options] = mock.bucket.upload.mock.calls[0];
		expect(path).toMatch(new RegExp(`^${ORG_ID}/asset/${ASSET_ID}/.+\\.jpg$`));
		expect(uploadedFile).toBeInstanceOf(File);
		expect(options).toEqual({ contentType: 'image/jpeg' });

		expect(mock.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				org_id: ORG_ID,
				entity_type: 'asset',
				entity_id: ASSET_ID,
				storage_path: path,
				caption: 'Front'
			})
		);
		expect(mock.bucket.remove).not.toHaveBeenCalled();
	});

	it('throws when the upload itself fails, and never inserts a row', async () => {
		const mock = withStorage(supabaseMock({ data: { id: 'i1' } }), {
			upload: { error: { message: 'bucket full' } }
		});

		await expect(
			createEntityImage(mock.supabase, ORG_ID, ENTITY, { file: file(), caption: null })
		).rejects.toThrow('bucket full');
		expect(mock.builder.insert).not.toHaveBeenCalled();
	});

	it('undoes the upload when the row insert fails', async () => {
		const mock = withStorage(supabaseMock({ error: { message: 'insert failed' } }));

		await expect(
			createEntityImage(mock.supabase, ORG_ID, ENTITY, { file: file(), caption: null })
		).rejects.toThrow('insert failed');

		expect(mock.bucket.upload).toHaveBeenCalledTimes(1);
		const [uploadedPath] = mock.bucket.upload.mock.calls[0];
		expect(mock.bucket.remove).toHaveBeenCalledWith([uploadedPath]);
	});

	it('updates a caption scoped to org and id', async () => {
		const mock = supabaseMock({ data: { id: 'i1', caption: 'New caption' } });

		await updateEntityImageCaption(mock.supabase, ORG_ID, 'i1', 'New caption');
		expect(mock.builder.update).toHaveBeenCalledWith({ caption: 'New caption' });
		expect(mock.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(mock.builder.eq).toHaveBeenCalledWith('id', 'i1');
	});

	it('removes the storage object only after the row is actually deleted', async () => {
		const mock = withStorage(supabaseMock({ data: [{ id: 'i1', storage_path: 'p1' }] }));

		await deleteEntityImage(mock.supabase, ORG_ID, 'i1');
		expect(mock.builder.select).toHaveBeenCalledWith('id, storage_path');
		expect(mock.bucket.remove).toHaveBeenCalledWith(['p1']);
	});

	it('throws and never touches storage when RLS or a missing row returns zero rows', async () => {
		const mock = withStorage(supabaseMock({ data: [] }));

		await expect(deleteEntityImage(mock.supabase, ORG_ID, 'i1')).rejects.toThrow(
			'Image was not deleted'
		);
		expect(mock.bucket.remove).not.toHaveBeenCalled();
	});
});
