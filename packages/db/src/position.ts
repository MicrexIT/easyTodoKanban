/** Gap below which a column should be renumbered to 1, 2, 3, … */
export const RENUMBER_GAP = 1e-6;

/** Midpoint between two neighbors. null means open end (head or tail). */
export function positionBetween(prev: number | null, next: number | null): number {
	if (prev == null && next == null) return 1.0;
	if (prev == null) return next! / 2;
	if (next == null) return prev + 1.0;
	return (prev + next) / 2;
}

export function needsRenumber(prev: number | null, next: number | null): boolean {
	if (prev == null || next == null) return false;
	return next - prev < RENUMBER_GAP;
}

/**
 * Positions for N items after renumber: 1.0, 2.0, … N.
 */
export function renumberPositions(count: number): number[] {
	return Array.from({ length: count }, (_, i) => i + 1.0);
}

/**
 * Given ordered neighbor positions around an insert slot, return the new
 * position — or signal that renumber is required first.
 */
export function resolveInsertPosition(
	prev: number | null,
	next: number | null
): { position: number; renumber: boolean } {
	if (needsRenumber(prev, next)) {
		return { position: 0, renumber: true };
	}
	return { position: positionBetween(prev, next), renumber: false };
}
