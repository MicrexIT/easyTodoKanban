import { describe, expect, it } from 'vitest';
import {
	positionBetween,
	needsRenumber,
	renumberPositions,
	resolveInsertPosition,
	RENUMBER_GAP
} from '../src/position.js';

describe('positionBetween', () => {
	it('returns 1.0 when no neighbors', () => {
		expect(positionBetween(null, null)).toBe(1.0);
	});

	it('inserts at head as half of next', () => {
		expect(positionBetween(null, 2)).toBe(1);
	});

	it('appends as prev + 1', () => {
		expect(positionBetween(3, null)).toBe(4);
	});

	it('uses midpoint between neighbors', () => {
		expect(positionBetween(1, 3)).toBe(2);
		expect(positionBetween(1, 2)).toBe(1.5);
	});
});

describe('needsRenumber', () => {
	it('is false when either end is open', () => {
		expect(needsRenumber(null, 1)).toBe(false);
		expect(needsRenumber(1, null)).toBe(false);
	});

	it('is false for healthy gaps', () => {
		expect(needsRenumber(1, 2)).toBe(false);
		expect(needsRenumber(1, 1 + RENUMBER_GAP * 2)).toBe(false);
	});

	it('is true when gap is too small', () => {
		expect(needsRenumber(1, 1 + RENUMBER_GAP / 2)).toBe(true);
		expect(needsRenumber(5, 5)).toBe(true);
	});
});

describe('renumberPositions', () => {
	it('emits 1..N', () => {
		expect(renumberPositions(0)).toEqual([]);
		expect(renumberPositions(3)).toEqual([1, 2, 3]);
	});
});

describe('resolveInsertPosition', () => {
	it('signals renumber when gap exhausted', () => {
		const r = resolveInsertPosition(1, 1 + 1e-9);
		expect(r.renumber).toBe(true);
	});

	it('returns midpoint when healthy', () => {
		const r = resolveInsertPosition(1, 3);
		expect(r.renumber).toBe(false);
		expect(r.position).toBe(2);
	});
});
