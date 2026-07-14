import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { moveCard, DbError } from '@easytodo/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = await event.request.json();
	try {
		const card = await moveCard(db, Number(body.cardId), {
			column: body.columnId ?? body.column,
			project: body.projectId ?? body.project,
			before_card_id: body.beforeCardId ?? body.before_card_id ?? null
		});
		return json(card);
	} catch (e) {
		if (e instanceof DbError) error(400, e.message);
		throw e;
	}
};
