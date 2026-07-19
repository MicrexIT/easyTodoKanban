import {
	clearCardGoogleEventId,
	getCard,
	replaceCardGoogleEventId,
	type Card,
	type D1Database
} from '@easytodo/db';
import type { GoogleServiceAccountCredentials } from './auth.js';
import { deleteEvent, upsertEvent } from './events.js';

export type CalendarSyncConfig = {
	credentials: GoogleServiceAccountCredentials;
	calendarId: string;
	origin: string;
};

export async function syncCardEvent(
	db: D1Database,
	card: Card,
	config: CalendarSyncConfig,
	depth = 0
): Promise<void> {
	if (!card.due_at || card.archived_at) {
		if (!card.gcal_event_id) return;
		await deleteEvent(config.credentials, config.calendarId, card.gcal_event_id);
		const cleared = await clearCardGoogleEventId(db, card.id, card.gcal_event_id, true);
		if (!cleared && depth === 0) {
			const current = await getCard(db, card.id);
			if (current.due_at && !current.archived_at) {
				await syncCardEvent(db, current, config, depth + 1);
			}
		}
		return;
	}

	const event = await upsertEvent(
		config.credentials,
		config.calendarId,
		{
			cardId: card.id,
			title: card.title,
			dueAt: card.due_at,
			origin: config.origin
		},
		card.gcal_event_id
	);
	const stored = await replaceCardGoogleEventId(db, card.id, event.id, {
		previousEventId: card.gcal_event_id,
		dueAt: card.due_at,
		title: card.title
	});

	// A newly inserted event lost a race with a newer card edit. Remove only
	// that new event; an existing id may already be owned by the newer sync.
	if (!stored && event.id !== card.gcal_event_id) {
		await deleteEvent(config.credentials, config.calendarId, event.id);
	}
}

export async function deleteCalendarEvents(
	config: Omit<CalendarSyncConfig, 'origin'>,
	eventIds: string[]
): Promise<void> {
	await Promise.all(
		eventIds.map((eventId) => deleteEvent(config.credentials, config.calendarId, eventId))
	);
}
