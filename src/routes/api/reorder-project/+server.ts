import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { DbError, reorderProject } from '@easytodo/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = (await event.request.json()) as {
		projectId?: unknown;
		beforeProjectId?: unknown;
	};
	const before = body.beforeProjectId;
	try {
		const project = await reorderProject(
			db,
			Number(body.projectId),
			before == null ? null : Number(before)
		);
		return json(project);
	} catch (cause) {
		if (cause instanceof DbError) error(400, cause.message);
		throw cause;
	}
};
