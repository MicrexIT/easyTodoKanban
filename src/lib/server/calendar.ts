import type { Card, D1Database } from '@easytodo/db';
import {
	deleteCalendarEvents,
	syncCardEvent,
	type CalendarSyncConfig,
	type GoogleServiceAccountCredentials
} from '@easytodo/gcal';

type CalendarPlatformEvent = {
	platform?: App.Platform;
	url: URL;
};

function credentialsFromEnv(
	env: App.Platform['env'] | undefined
): GoogleServiceAccountCredentials | null {
	if (!env?.GOOGLE_SA_EMAIL || !env.GOOGLE_SA_KEY) return null;
	return {
		serviceAccountEmail: env.GOOGLE_SA_EMAIL,
		privateKey: env.GOOGLE_SA_KEY
	};
}

export function calendarConfig(event: CalendarPlatformEvent): CalendarSyncConfig | null {
	const credentials = credentialsFromEnv(event.platform?.env);
	const calendarId = event.platform?.env.GOOGLE_CALENDAR_ID;
	if (!credentials || !calendarId) return null;
	return { credentials, calendarId, origin: event.url.origin };
}

function reportCalendarFailure(operation: string, cause: unknown): void {
	console.error(
		JSON.stringify({
			level: 'error',
			component: 'google-calendar',
			operation,
			message: cause instanceof Error ? cause.message : String(cause)
		})
	);
}

function runInBackground(
	event: CalendarPlatformEvent,
	operation: string,
	promise: Promise<void>
): void {
	const guarded = promise.catch((cause) => reportCalendarFailure(operation, cause));
	if (event.platform?.context) {
		event.platform.context.waitUntil(guarded);
		return;
	}
	void guarded;
}

export function scheduleCardCalendarSync(
	event: CalendarPlatformEvent,
	db: D1Database,
	card: Card
): void {
	const config = calendarConfig(event);
	if (!config) return;
	runInBackground(event, `sync-card-${card.id}`, syncCardEvent(db, card, config));
}

export function scheduleCalendarEventDeletion(
	event: CalendarPlatformEvent,
	eventIds: string[]
): void {
	if (eventIds.length === 0) return;
	const config = calendarConfig(event);
	if (!config) return;
	runInBackground(
		event,
		'delete-events',
		deleteCalendarEvents(
			{ credentials: config.credentials, calendarId: config.calendarId },
			eventIds
		)
	);
}
