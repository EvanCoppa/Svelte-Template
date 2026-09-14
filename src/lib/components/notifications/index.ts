import Panel from './notification-panel.svelte';
import Row from './notification-row.svelte';

/**
 * What the bell in the app header opens. `AppHeader` owns the button, the
 * unread dot and the popover around it — the trigger sits with its siblings
 * (the theme toggle, log out) so the three look and behave alike — and drops
 * `Panel` inside, with the rows the shell's load already fetched.
 *
 * `Row` is exported for the same reason every part of a compound is: a
 * surface that lists notifications somewhere other than the bell (a settings
 * page, a full inbox screen) draws the same row rather than a second one.
 */
export {
	Panel,
	Row,
	//
	Panel as NotificationPanel,
	Row as NotificationRow
};
