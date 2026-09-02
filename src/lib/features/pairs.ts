/**
 * `feature_id` joined with a second id (an industry, a tier, a role) the way
 * the operator console's grids post their cells. Client-safe so the page
 * that renders a grid and the action that diffs it agree on the key.
 */
export const PAIR_SEPARATOR = '|';

export function pairKey(featureId: string, otherId: string): string {
	return `${featureId}${PAIR_SEPARATOR}${otherId}`;
}

export function splitPair(key: string): [featureId: string, otherId: string] | null {
	const at = key.indexOf(PAIR_SEPARATOR);
	if (at <= 0 || at === key.length - 1) return null;
	return [key.slice(0, at), key.slice(at + 1)];
}
