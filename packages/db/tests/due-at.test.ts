import { describe, expect, it } from 'vitest';
import { DbError, normalizeDueAt } from '../src/index.js';

describe('normalizeDueAt', () => {
	it('sets all-day and timed deadlines', () => {
		expect(normalizeDueAt('2026-07-24')).toBe('2026-07-24');
		expect(normalizeDueAt('2026-07-24T09:30:00Z')).toBe('2026-07-24T09:30:00.000Z');
	});

	it('clears a deadline with null', () => {
		expect(normalizeDueAt(null)).toBeNull();
	});

	it.each([
		'',
		'not-a-date',
		'2026-02-30',
		'2026-07-24T09:30:00',
		'2026-07-24T09:30:00+02:00'
	])('rejects invalid due_at %j', (value) => {
		expect(() => normalizeDueAt(value)).toThrow(DbError);
	});
});
