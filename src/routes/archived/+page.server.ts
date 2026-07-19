import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	deleteCardPermanently,
	getCard,
	getDefaultProject,
	listCardAttachmentKeys,
	listArchived,
	listProjects,
	restoreCard
} from '@easytodo/db';
import { deleteMediaObjects, getMediaBucket } from '$lib/server/media';
import {
	scheduleCalendarEventDeletion,
	scheduleCardCalendarSync
} from '$lib/server/calendar';

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
			const card = await restoreCard(db, Number(data.get('cardId')));
			scheduleCardCalendarSync(event, db, card);
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
			const card = await getCard(db, cardId);
			const keys = await listCardAttachmentKeys(db, cardId);
			const bucket = getMediaBucket(event, keys.length > 0);
			await deleteCardPermanently(db, cardId);
			scheduleCalendarEventDeletion(event, card.gcal_event_id ? [card.gcal_event_id] : []);
			await deleteMediaObjects(bucket, keys);
			return { ok: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'delete failed' });
		}
	}
};
