import Root from './calendar.svelte';
import Event from './calendar-event.svelte';
import Month from './calendar-month.svelte';
import Placeholder from './calendar-placeholder.svelte';
import Title from './calendar-title.svelte';
import Toolbar from './calendar-toolbar.svelte';
import Week from './calendar-week.svelte';

/**
 * The calendar, as the page composes it:
 *
 *   <Calendar.Toolbar>…today, the arrows, <Calendar.Title />, the view switch…</Calendar.Toolbar>
 *   <Calendar.Root>
 *     <Calendar.Month {anchor} {events} onSelectDay={…} onSelectEvent={…} onMove={…} />
 *     — or —
 *     <Calendar.Week {days} {events} onSelectSlot={…} onSelectEvent={…} onMove={…} />
 *   </Calendar.Root>
 *
 * Structural parts (`Root`, `Toolbar`, `Title`, `Placeholder`) and two
 * interactive views that own their own pointer gestures and hand the result
 * up as callback props — the page owns every event, every form and every
 * write. `Event` is the one way an event is drawn; the views place it.
 */
export {
	Root,
	Toolbar,
	Title,
	Month,
	Week,
	Event,
	Placeholder,
	//
	Root as Calendar,
	Toolbar as CalendarToolbar,
	Title as CalendarTitle,
	Month as CalendarMonth,
	Week as CalendarWeek,
	Event as CalendarEvent,
	Placeholder as CalendarPlaceholder
};

export type {
	CalendarAnchor,
	MoveHandler,
	SelectEventHandler,
	SelectSlotHandler,
	SlotSelection
} from './types';
