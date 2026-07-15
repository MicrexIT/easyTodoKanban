import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	deleteCardPermanently,
	getDefaultProject,
	listCardAttachmentKeys,
	listArchived,
	listProjects,
	restoreCard
} from '@easytodo/db';
import { deleteMediaObjects, getMediaBucket } from '$lib/server/media';

export const load: PageServerLoad = async (event) => {
	const db = getDb(event);
	const projectSlug = event.url.searchParams.get('project') ?? undefined;
	const [archived, projects, defaultProject] = await Promise.all([
		listArchived(db, projectSlug ?? undefined),
		listProjects(db),
		getDefaultProject(db)
	]);
	return {
		archived,
		projects,
		currentSlug: projectSlug ?? defaultProject.slug
	};
};

export const actions: Actions = {
	restore: async (event) => {
		const db = getDb(event);
		const data = await event.request.formData();
		try {
			await restoreCard(db, Number(data.get('cardId')));
			return { ok: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'restore failed' });
		}
	},
	delete: async (event) => {
		const db = getDb(event);
		const data = await event.request.formData();
		const cardId = Number(data.get('cardId'));
		try {
			const keys = await listCardAttachmentKeys(db, cardId);
			const bucket = getMediaBucket(event, keys.length > 0);
			await deleteCardPermanently(db, cardId);
			await deleteMediaObjects(bucket, keys);
			return { ok: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'delete failed' });
		}
	}
};
