import Add from './tab-strip-add.svelte';
import Close from './tab-strip-close.svelte';
import Tab from './tab-strip-tab.svelte';
import Root from './tab-strip.svelte';

/**
 * The open-documents tab bar: `Root` is the strip, `Tab` one open thing (a
 * link, so ⌘-click and browser history work), `Close` its ×, and `Add` the
 * control that opens another. The page owns what is open and what opening or
 * closing one does.
 *
 * Not to be confused with `ui/tabs`, which switches between panels of one
 * screen. These tabs are places you can go.
 */
export {
	Root,
	Tab,
	Close,
	Add,
	//
	Root as TabStrip,
	Tab as TabStripTab,
	Close as TabStripClose,
	Add as TabStripAdd
};
