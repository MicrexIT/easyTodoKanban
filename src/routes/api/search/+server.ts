import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchCards } from '@easytodo/db';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async (event) => {
	const query = event.url.searchParams.get('q')?.trim() ?? '';
	const project = event.url.searchParams.get('project')?.trim() || undefined;

	if (!query) return json({ results: [] });

	const results = await searchCards(getDb(event), query, project);
	return json({ results });
};
