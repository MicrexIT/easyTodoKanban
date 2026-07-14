import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { reorderColumn, DbError } from '@easytodo/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = await event.request.json();
	const before = body.beforeColumnId ?? body.before_column_id ?? null;
	try {
		const col = await reorderColumn(
			db,
			Number(body.columnId),
			before == null ? null : Number(before)
		);
		return json(col);
	} catch (e) {
		if (e instanceof DbError) error(400, e.message);
		throw e;
	}
};
