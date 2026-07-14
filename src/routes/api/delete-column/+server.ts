import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { deleteColumn, DbError } from '@easytodo/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = await event.request.json();
	try {
		await deleteColumn(db, Number(body.columnId));
		return json({ ok: true });
	} catch (e) {
		if (e instanceof DbError) error(400, e.message);
		throw e;
	}
};
