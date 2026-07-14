import type { D1Database } from '@easytodo/db';
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export function getDb(event: {
	platform?: App.Platform;
}): D1Database {
	const db = event.platform?.env?.DB;
	if (!db) {
		error(
			500,
			'Database binding missing. Run with `pnpm dev` (adapter-cloudflare + wrangler) and apply local migrations.'
		);
	}
	return db as D1Database;
}
