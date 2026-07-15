import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { deleteColumn, DbError, listColumnAttachmentKeys } from '@easytodo/db';
import { deleteMediaObjects, getMediaBucket } from '$lib/server/media';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = await event.request.json();
	try {
		const columnId = Number(body.columnId);
		const keys = await listColumnAttachmentKeys(db, columnId);
		const bucket = getMediaBucket(event, keys.length > 0);
		await deleteColumn(db, columnId);
		await deleteMediaObjects(bucket, keys);
		return json({ ok: true });
	} catch (e) {
		if (e instanceof DbError) error(400, e.message);
		throw e;
	}
};
