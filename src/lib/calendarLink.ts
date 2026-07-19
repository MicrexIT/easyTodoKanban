const ALL_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export type GoogleCalendarLinkOptions = {
	cardId: number;
	title: string;
	dueAt: string;
	origin: string;
};

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

function formatUtcDate(date: Date): string {
	return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function formatUtcDateTime(date: Date): string {
	return `${formatUtcDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
		date.getUTCSeconds()
	)}Z`;
}

function parseAllDay(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		throw new RangeError(`Invalid all-day deadline: ${value}`);
	}
	return date;
}

function calendarDates(dueAt: string): string {
	if (ALL_DAY.test(dueAt)) {
		const start = parseAllDay(dueAt);
		const end = new Date(start.getTime());
		end.setUTCDate(end.getUTCDate() + 1);
		return `${formatUtcDate(start)}/${formatUtcDate(end)}`;
	}

	const start = new Date(dueAt);
	if (Number.isNaN(start.getTime())) throw new RangeError(`Invalid timed deadline: ${dueAt}`);
	const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
	return `${formatUtcDateTime(start)}/${formatUtcDateTime(end)}`;
}

export function buildGoogleCalendarLink({
	cardId,
	title,
	dueAt,
	origin
}: GoogleCalendarLinkOptions): string {
	const calendarUrl = new URL('https://calendar.google.com/calendar/render');
	const cardUrl = new URL(`/c/${cardId}`, new URL(origin).origin);

	calendarUrl.searchParams.set('action', 'TEMPLATE');
	calendarUrl.searchParams.set('text', title);
	calendarUrl.searchParams.set('dates', calendarDates(dueAt));
	calendarUrl.searchParams.set('details', cardUrl.toString());

	return calendarUrl.toString();
}
