import { describe, expect, it } from 'vitest';
import { mapCardToEvent, normalizeDay } from '../src/events';

describe('mapCardToEvent', () => {
	it('maps an all-day deadline with an exclusive next-day end', () => {
		expect(
			mapCardToEvent({
				cardId: 12,
				title: 'Ship it',
				dueAt: '2026-12-31',
				origin: 'https://todos.example/'
			})
		).toMatchObject({
			summary: 'Ship it',
			description: 'https://todos.example/c/12',
			start: { date: '2026-12-31' },
			end: { date: '2027-01-01' },
			extendedProperties: { private: { easyTodoCardId: '12' } }
		});
	});

	it('maps a timed deadline to a one-hour UTC event', () => {
		const event = mapCardToEvent({
			cardId: 7,
			title: 'Call',
			dueAt: '2026-07-24T13:30:00.000Z',
			origin: 'https://todos.example'
		});
		expect(event.start).toEqual({ dateTime: '2026-07-24T13:30:00.000Z' });
		expect(event.end).toEqual({ dateTime: '2026-07-24T14:30:00.000Z' });
	});
});

describe('normalizeDay', () => {
	it('rejects impossible or malformed dates', () => {
		expect(() => normalizeDay('2026-02-29')).toThrow(/real calendar day/);
		expect(() => normalizeDay('24 July 2026')).toThrow(/YYYY-MM-DD/);
	});
});
