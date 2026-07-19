import {
	getAccessToken,
	readGoogleResponse,
	type GoogleServiceAccountCredentials
} from './auth.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CardEventInput = {
	cardId: number;
	title: string;
	dueAt: string;
	origin: string;
};

export type GoogleEventDate = {
	date?: string;
	dateTime?: string;
	timeZone?: string;
};

export type GoogleCalendarEvent = {
	id: string;
	summary: string;
	htmlLink: string;
	start: GoogleEventDate;
	end: GoogleEventDate;
};

export type GoogleEventBody = {
	summary: string;
	description: string;
	start: GoogleEventDate;
	end: GoogleEventDate;
	extendedProperties: { private: { easyTodoCardId: string } };
};

export class GoogleCalendarError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'GoogleCalendarError';
	}
}

function isRealDay(value: string): boolean {
	const match = DAY.exec(value);
	if (!match) return false;
	const [, year, month, day] = match;
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
	return (
		date.getUTCFullYear() === Number(year) &&
		date.getUTCMonth() === Number(month) - 1 &&
		date.getUTCDate() === Number(day)
	);
}

export function normalizeDay(value: string): string {
	if (!isRealDay(value)) throw new Error('date must be a real calendar day in YYYY-MM-DD format');
	return value;
}

function nextDay(day: string): string {
	const [year, month, date] = day.split('-').map(Number);
	const next = new Date(Date.UTC(year, month - 1, date + 1));
	return next.toISOString().slice(0, 10);
}

export function mapCardToEvent(input: CardEventInput): GoogleEventBody {
	const description = new URL(`/c/${input.cardId}`, input.origin).toString();
	const allDay = DAY.test(input.dueAt);
	let start: GoogleEventDate;
	let end: GoogleEventDate;

	if (allDay) {
		normalizeDay(input.dueAt);
		start = { date: input.dueAt };
		end = { date: nextDay(input.dueAt) };
	} else {
		const startMs = Date.parse(input.dueAt);
		if (!Number.isFinite(startMs)) throw new Error('dueAt must be a date or ISO datetime');
		start = { dateTime: new Date(startMs).toISOString() };
		end = { dateTime: new Date(startMs + 60 * 60 * 1000).toISOString() };
	}

	return {
		summary: input.title,
		description,
		start,
		end,
		extendedProperties: { private: { easyTodoCardId: String(input.cardId) } }
	};
}

function calendarUrl(calendarId: string, eventId?: string): string {
	const path = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
	return eventId ? `${path}/${encodeURIComponent(eventId)}` : path;
}

async function googleFetch(
	credentials: GoogleServiceAccountCredentials,
	url: string,
	init: RequestInit,
	fetcher: typeof fetch
): Promise<Response> {
	const token = await getAccessToken(credentials, { fetch: fetcher });
	const headers = new Headers(init.headers);
	headers.set('authorization', `Bearer ${token}`);
	return fetcher(url, { ...init, headers });
}

async function parseEventResponse(response: Response): Promise<GoogleCalendarEvent> {
	const raw = await readGoogleResponse(response, 256 * 1024);
	if (!response.ok) {
		throw new GoogleCalendarError(
			`Google Calendar request failed (${response.status}): ${raw}`,
			response.status
		);
	}
	return JSON.parse(raw) as GoogleCalendarEvent;
}

export async function upsertEvent(
	credentials: GoogleServiceAccountCredentials,
	calendarId: string,
	input: CardEventInput,
	eventId?: string | null,
	fetcher: typeof fetch = fetch
): Promise<GoogleCalendarEvent> {
	const body = JSON.stringify(mapCardToEvent(input));
	if (eventId) {
		const patched = await googleFetch(
			credentials,
			calendarUrl(calendarId, eventId),
			{ method: 'PATCH', headers: { 'content-type': 'application/json' }, body },
			fetcher
		);
		if (patched.status !== 404 && patched.status !== 410) return parseEventResponse(patched);
		await patched.body?.cancel();
	}

	const inserted = await googleFetch(
		credentials,
		calendarUrl(calendarId),
		{ method: 'POST', headers: { 'content-type': 'application/json' }, body },
		fetcher
	);
	return parseEventResponse(inserted);
}

export async function deleteEvent(
	credentials: GoogleServiceAccountCredentials,
	calendarId: string,
	eventId: string,
	fetcher: typeof fetch = fetch
): Promise<void> {
	const response = await googleFetch(
		credentials,
		calendarUrl(calendarId, eventId),
		{ method: 'DELETE' },
		fetcher
	);
	if (response.ok || response.status === 404 || response.status === 410) {
		await response.body?.cancel();
		return;
	}
	const raw = await readGoogleResponse(response, 64 * 1024);
	throw new GoogleCalendarError(
		`Google Calendar delete failed (${response.status}): ${raw}`,
		response.status
	);
}

type EventListResponse = {
	items?: GoogleCalendarEvent[];
	nextPageToken?: string;
};

export async function listDay(
	credentials: GoogleServiceAccountCredentials,
	calendarId: string,
	date: string,
	fetcher: typeof fetch = fetch
): Promise<GoogleCalendarEvent[]> {
	const day = normalizeDay(date);
	const events: GoogleCalendarEvent[] = [];
	let pageToken: string | undefined;

	do {
		const query = new URLSearchParams({
			timeMin: `${day}T00:00:00Z`,
			timeMax: `${nextDay(day)}T00:00:00Z`,
			singleEvents: 'true',
			orderBy: 'startTime',
			maxResults: '250'
		});
		if (pageToken) query.set('pageToken', pageToken);
		const response = await googleFetch(
			credentials,
			`${calendarUrl(calendarId)}?${query}`,
			{ method: 'GET' },
			fetcher
		);
		const raw = await readGoogleResponse(response);
		if (!response.ok) {
			throw new GoogleCalendarError(
				`Google Calendar list failed (${response.status}): ${raw}`,
				response.status
			);
		}
		const page = JSON.parse(raw) as EventListResponse;
		events.push(...(page.items ?? []));
		pageToken = page.nextPageToken;
	} while (pageToken && events.length < 1000);

	return events;
}
