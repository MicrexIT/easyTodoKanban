import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { renameColumn, DbError } from '@easytodo/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = await event.request.json();
	try {
		const col = await renameColumn(db, Number(body.columnId), body.name);
		return json(col);
	} catch (e) {
		if (e instanceof DbError) error(400, e.message);
		throw e;
	}
};
