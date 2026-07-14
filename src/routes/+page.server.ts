import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getDefaultProject } from '@easytodo/db';

export const load: PageServerLoad = async (event) => {
	const db = getDb(event);
	const project = await getDefaultProject(db);
	throw redirect(302, `/p/${project.slug}`);
};
