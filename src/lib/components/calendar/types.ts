import type { Placement } from '$lib/calendar';
import type { CalendarEvent } from '$lib/server/crm/calendar';

/**
 * What the calendar parts hand back up to the page. Kept in a plain module
 * for the reason `ui/combobox/combobox.ts` gives: `tsc` cannot follow a named
 * type export out of a `.svelte` file, and the page's handlers are typed
 * against these.
 */

/**
 * Where a popover should point: an element, or anything that can say where
 * it is — the week view anchors the booking popover to the slot that was
 * drawn, which is a rectangle in a column rather than a node of its own.
 */
export type CalendarAnchor = HTMLElement | { getBoundingClientRect: () => DOMRect };

/** A slot picked on the grid: the instants it covers, and whether it was picked as a day. */
export type SlotSelection = Placement & { allDay: boolean };

export type SelectSlotHandler = (slot: SlotSelection, anchor: CalendarAnchor) => void;
export type SelectEventHandler = (event: CalendarEvent, anchor: CalendarAnchor) => void;
/** A drag or a stretch has landed: the event and where it now sits. */
export type MoveHandler = (event: CalendarEvent, placement: Placement) => void;
