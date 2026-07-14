import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	DbError,
	archiveCard,
	getBoard,
	getCard,
	listProjects,
	moveCard,
	updateCard
} from '@easytodo/db';

export const load: PageServerLoad = async (event) => {
	const db = getDb(event);
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) error(404, 'not found');
	try {
		const card = await getCard(db, id);
		const [board, projects] = await Promise.all([
			getBoard(db, card.project_id),
			listProjects(db)
		]);
		const columnIndex = board.columns.findIndex((c) => c.id === card.column_id);
		return {
			card,
			projects,
			columns: board.columns.map((c) => ({ id: c.id, name: c.name })),
			columnIndex,
			project: board.project
		};
	} catch (e) {
		if (e instanceof DbError) error(404, e.message);
		throw e;
	}
};

export const actions: Actions = {
	update: async (event) => {
		const db = getDb(event);
		const data = await event.request.formData();
		const cardId = Number(event.params.id);
		try {
			await updateCard(db, cardId, {
				title: String(data.get('title') ?? ''),
				body_md: String(data.get('body_md') ?? '')
			});
			return { ok: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'update failed' });
		}
	},
	move: async (event) => {
		const db = getDb(event);
		const data = await event.request.formData();
		const cardId = Number(event.params.id);
		try {
			await moveCard(db, cardId, { column: Number(data.get('columnId')) });
			return { ok: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'move failed' });
		}
	},
	archive: async (event) => {
		const db = getDb(event);
		const cardId = Number(event.params.id);
		try {
			const card = await archiveCard(db, cardId);
			const full = await getCard(db, card.id);
			throw redirect(303, `/p/${full.project_slug}`);
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
			return fail(400, { message: e instanceof Error ? e.message : 'archive failed' });
		}
	}
};
