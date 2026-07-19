import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listDay, normalizeDay } from '@easytodo/gcal';
import { calendarConfig } from '$lib/server/calendar';

const CACHE_SECONDS = 5 * 60;

export const GET: RequestHandler = async (event) => {
	const rawDate = event.url.searchParams.get('date') ?? '';
	let date: string;
	try {
		date = normalizeDay(rawDate);
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'invalid date');
	}

	const config = calendarConfig(event);
	if (!config) error(503, 'Google Calendar is not configured');

	const cache = event.platform?.caches?.default;
	const cacheKey = `${event.url.origin}/api/agenda?date=${encodeURIComponent(date)}`;
	if (cache) {
		try {
			const cached = await cache.match(cacheKey);
			if (cached) {
				return json(await cached.json(), {
					headers: { 'cache-control': `public, max-age=${CACHE_SECONDS}` }
				});
			}
		} catch {
			// Cache API can be unavailable when the Worker is behind Cloudflare Access.
		}
	}

	try {
		const events = await listDay(config.credentials, config.calendarId, date);
		const response = json(
			{ date, events },
			{ headers: { 'cache-control': `public, max-age=${CACHE_SECONDS}` } }
		);
		if (cache && event.platform?.context) {
			// SvelteKit's DOM Response and Workers' Response are runtime-compatible;
			// their type packages expose different Cloudflare-only properties.
			event.platform.context.waitUntil(
				// @ts-expect-error The two Response declarations describe the same runtime object.
				cache.put(cacheKey, response.clone()).catch((cause) => {
					console.error(
						JSON.stringify({
							level: 'warn',
							component: 'google-calendar',
							operation: 'cache-agenda',
							message: cause instanceof Error ? cause.message : String(cause)
						})
					);
				})
			);
		}
		return response;
	} catch (cause) {
		console.error(
			JSON.stringify({
				level: 'error',
				component: 'google-calendar',
				operation: 'list-agenda',
				message: cause instanceof Error ? cause.message : String(cause)
			})
		);
		error(502, 'Could not load Google Calendar');
	}
};
