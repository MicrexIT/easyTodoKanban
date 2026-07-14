import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createColumn, DbError } from '@easytodo/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = await event.request.json();
	try {
		const col = await createColumn(db, body.projectId ?? body.project, body.name);
		return json(col);
	} catch (e) {
		if (e instanceof DbError) error(400, e.message);
		throw e;
	}
};
