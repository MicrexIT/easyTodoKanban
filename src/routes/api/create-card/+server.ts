import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createCard, DbError } from '@easytodo/db';
import { scheduleCardCalendarSync } from '$lib/server/calendar';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = await event.request.json();
	try {
		const card = await createCard(db, {
			project: body.projectId ?? body.project,
			column: body.columnId ?? body.column,
			title: body.title,
			body_md: body.body_md,
			due_at: body.due_at,
			top: body.top
		});
		scheduleCardCalendarSync(event, db, card);
		return json(card);
	} catch (e) {
		if (e instanceof DbError) error(400, e.message);
		throw e;
	}
};
