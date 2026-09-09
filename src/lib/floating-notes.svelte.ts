import { browser } from '$app/environment';
import { z } from 'zod';

/**
 * The notes pulled off the dock and left floating over the page.
 *
 * Opening a note in the dock grows it in place, stuck to the edge. Grab its
 * rim and pull, and it comes off the edge: from then on it is a sticky note
 * on the screen, wherever it was dropped, over every page — the dock is the
 * shell's, so a floating note follows a navigation the same way the rail does.
 * It stays until its × is pressed or it is dragged back onto the dock.
 *
 * Where a note floats is this tab's, like the breadcrumb trail
 * (`$lib/breadcrumbs.svelte`): a few numbers per note in `sessionStorage`, so
 * a reload keeps the desk as it was, a second tab starts with a clear one, and
 * nothing rides on a request. Not a preference — you would not want a note
 * you left over a spreadsheet on this monitor to appear over a different
 * screen on your laptop (docs/user-preferences.md) — and scoped to one user
 * in one organization for the reason the trail is: a note floated in one org
 * must not hang over a screen the next org's session cannot even read.
 *
 * Only the placement lives here. The note itself is still the row the layout
 * ships, so archiving or deleting it takes it off the screen with no extra
 * wiring — the dock draws a floating note only when the rail still has it.
 */

/** A top-left corner, in viewport pixels. */
const cornerSchema = z.object({ x: z.number(), y: z.number() });

type Corner = z.infer<typeof cornerSchema>;

/** Where a note floats: which note, and its corner. */
const placementSchema = cornerSchema.extend({ id: z.string() });

export type FloatingNote = z.infer<typeof placementSchema>;

/** A stored desk is untrusted input like any other, so it is parsed, not cast. */
const deskSchema = z.array(placementSchema);

const STORAGE_PREFIX = 'floating-notes:';

/**
 * How much of a floating note must stay on screen, in pixels: enough of the
 * rim to grab it again, so a note can never be lost past the edge.
 */
export const KEEP_ON_SCREEN = 48;

/**
 * A corner clamped so the note stays reachable: its top edge on screen (the ×
 * is there), and at least `KEEP_ON_SCREEN` of its width inside either side.
 * Pure, so the rule is testable without a viewport.
 */
export function clampPlacement(
	corner: Corner,
	size: { width: number; height: number },
	viewport: { width: number; height: number }
): Corner {
	const minX = KEEP_ON_SCREEN - size.width;
	const maxX = viewport.width - KEEP_ON_SCREEN;
	const maxY = Math.max(0, viewport.height - KEEP_ON_SCREEN);
	return {
		x: Math.min(Math.max(corner.x, minX), maxX),
		y: Math.min(Math.max(corner.y, 0), maxY)
	};
}

/**
 * One desk with a note placed on it, replacing where that note was if it was
 * already floating. Pure, like `appendCrumb`.
 */
export function placeNote(desk: readonly FloatingNote[], note: FloatingNote): FloatingNote[] {
	return [...desk.filter((placed) => placed.id !== note.id), note];
}

function createFloatingNotes() {
	let desk = $state<FloatingNote[]>([]);
	/** The scope the desk was restored for — see `breadcrumbs.visit()`. */
	let scope = $state<string | null>(null);

	function enter(nextScope: string) {
		if (nextScope !== scope) {
			scope = nextScope;
			desk = restore(nextScope);
		}
	}

	function write(nextScope: string, next: FloatingNote[]) {
		desk = next;
		persist(nextScope, next);
	}

	return {
		/**
		 * The notes floating for a scope, in the order they were last touched
		 * (the last one is on top). A scope the desk was not built in gets an
		 * empty desk rather than another session's.
		 */
		floatingIn(wanted: string): readonly FloatingNote[] {
			enter(wanted);
			return wanted === scope ? desk : [];
		},

		/** Float a note at a corner, or move one that already floats there. It comes to the top. */
		place(nextScope: string, note: FloatingNote): void {
			enter(nextScope);
			write(nextScope, placeNote(desk, note));
		},

		/** Back onto the dock: the note stops floating. */
		dock(nextScope: string, id: string): void {
			enter(nextScope);
			write(
				nextScope,
				desk.filter((placed) => placed.id !== id)
			);
		}
	};
}

/** Storage is absent on the server and can throw in private modes; either way, a clear desk. */
function restore(scope: string): FloatingNote[] {
	if (!browser) return [];
	try {
		const raw = sessionStorage.getItem(STORAGE_PREFIX + scope);
		const parsed = deskSchema.safeParse(raw ? JSON.parse(raw) : []);
		return parsed.success ? parsed.data : [];
	} catch {
		return [];
	}
}

function persist(scope: string, desk: readonly FloatingNote[]): void {
	if (!browser) return;
	try {
		sessionStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(desk));
	} catch {
		// Storage disabled or full — where a note floats is a convenience, not state to defend.
	}
}

export const floatingNotes = createFloatingNotes();
