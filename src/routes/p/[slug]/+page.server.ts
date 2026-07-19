import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	DbError,
	archiveCard,
	createProject,
	getBoard,
	listProjects,
	updateCard
} from '@easytodo/db';

export const load: PageServerLoad = async (event) => {
	const db = getDb(event);
	const slug = event.params.slug;
	try {
		const [board, projects] = await Promise.all([getBoard(db, slug), listProjects(db)]);
		return { board, projects };
	} catch (e) {
		if (e instanceof DbError) error(404, e.message);
		throw e;
	}
};

export const actions: Actions = {
	updateCard: async (event) => {
		const db = getDb(event);
		const data = await event.request.formData();
		const cardId = Number(data.get('cardId'));
		const title = String(data.get('title') ?? '');
		const body_md = String(data.get('body_md') ?? '');
		const rawDueAt = data.get('due_at');
		const due_at = rawDueAt === null ? undefined : String(rawDueAt) || null;
		try {
			await updateCard(db, cardId, { title, body_md, due_at });
			return { ok: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'update failed' });
		}
	},
	archiveCard: async (event) => {
		const db = getDb(event);
		const data = await event.request.formData();
		const cardId = Number(data.get('cardId'));
		try {
			await archiveCard(db, cardId);
			return { ok: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'archive failed' });
		}
	},
	createProject: async (event) => {
		const db = getDb(event);
		const data = await event.request.formData();
		const name = String(data.get('name') ?? '');
		try {
			const project = await createProject(db, name);
			return { ok: true, project };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'create failed' });
		}
	}
};
