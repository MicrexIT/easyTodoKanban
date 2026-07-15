import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import {
	DbError,
	deleteProject,
	listProjectAttachmentKeys,
	listProjects
} from '@easytodo/db';
import { deleteMediaObjects, getMediaBucket } from '$lib/server/media';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const body = (await event.request.json()) as { projectId?: unknown };
	const projectId = Number(body.projectId);
	try {
		const keys = await listProjectAttachmentKeys(db, projectId);
		const bucket = getMediaBucket(event, keys.length > 0);
		await deleteProject(db, projectId);
		await deleteMediaObjects(bucket, keys);
		const remaining = await listProjects(db);
		return json({ ok: true, nextSlug: remaining[0]?.slug ?? null });
	} catch (cause) {
		if (cause instanceof DbError) error(400, cause.message);
		throw cause;
	}
};
