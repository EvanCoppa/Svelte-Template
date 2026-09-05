/**
 * The upgrade prompt, as one call from anywhere in the app:
 *
 *   import { showUpgrade } from '$lib/upgrade.svelte';
 *   showUpgrade('deals');   // a click landed on something the plan lacks
 *   showUpgrade();          // the generic pitch: the next plan up
 *
 * Module-level runes, like the theme, so a locked sidebar entry, a palette
 * row, a disabled button and the feature gate's redirect all open the same
 * dialog — the one `UpgradePrompt` the (app) layout mounts. Nothing here
 * decides what to pitch; the prompt derives that from the layout's plans.
 */
function createUpgradePrompt() {
	let open = $state(false);
	let featureId = $state<string | null>(null);

	return {
		get open() {
			return open;
		},
		/** The feature that prompted the pitch, or null for the generic one. */
		get featureId() {
			return featureId;
		},
		show(id?: string) {
			featureId = id ?? null;
			open = true;
		},
		/** Keeps `featureId`, so the dialog's exit animation still shows the same pitch. */
		dismiss() {
			open = false;
		}
	};
}

export const upgradePrompt = createUpgradePrompt();

/**
 * Pop the upgrade prompt: for `featureId` when a locked feature was the
 * reason, otherwise the next plan up.
 */
export function showUpgrade(featureId?: string): void {
	upgradePrompt.show(featureId);
}
