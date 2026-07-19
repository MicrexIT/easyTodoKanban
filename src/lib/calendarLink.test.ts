import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarLink } from './calendarLink';

function calendarParams(dueAt: string) {
	const url = new URL(
		buildGoogleCalendarLink({
			cardId: 42,
			title: 'Ship calendar links & celebrate',
			dueAt,
			origin: 'https://todo.example.com/ignored/path'
		})
	);
	return { url, params: url.searchParams };
}

describe('buildGoogleCalendarLink', () => {
	it('builds an all-day event with an exclusive next-day end', () => {
		const { url, params } = calendarParams('2026-07-24');

		expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
		expect(params.get('action')).toBe('TEMPLATE');
		expect(params.get('text')).toBe('Ship calendar links & celebrate');
		expect(params.get('dates')).toBe('20260724/20260725');
		expect(params.get('details')).toBe('https://todo.example.com/c/42');
	});

	it('builds a timed UTC event with a one-hour duration', () => {
		const { params } = calendarParams('2026-07-24T09:30:15.000Z');

		expect(params.get('dates')).toBe('20260724T093015Z/20260724T103015Z');
	});

	it.each([
		['month', '2026-01-31', '20260131/20260201'],
		['year', '2026-12-31', '20261231/20270101']
	])('handles an all-day %s boundary', (_boundary, dueAt, expected) => {
		const { params } = calendarParams(dueAt);

		expect(params.get('dates')).toBe(expected);
	});
});
