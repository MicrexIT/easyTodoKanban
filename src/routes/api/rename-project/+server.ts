import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { DbError, renameProject } from '@easytodo/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = (await event.request.json()) as { projectId?: unknown; name?: unknown };
	try {
		const project = await renameProject(db, Number(body.projectId), String(body.name ?? ''));
		return json(project);
	} catch (cause) {
		if (cause instanceof DbError) error(400, cause.message);
		throw cause;
	}
};
