import { browser } from '$app/environment';
import { EMPTY_SCENE, parseScene, type Scene, type WhiteboardElement } from './scene';

/**
 * The board itself: one scene, kept in `localStorage`.
 *
 * This is the **device** axis of docs/user-preferences.md, and deliberately
 * so. A whiteboard is the surface you think on at the machine you are
 * sitting at — nothing else in the app reads it, no colleague sees it, and
 * the organization has no opinion about it — so it is stored exactly where
 * the theme and the list/board choice are, with the same bargain: a private
 * window or cleared site data reads as "no value" and you get a fresh canvas.
 * There is no table behind it and nothing to invalidate.
 *
 * **Scoped to the person, not the organization.** Every other device-axis
 * value in the app (`$lib/theme.svelte`, `$lib/list-view.svelte`) is the
 * machine's rather than the tenant's, and a scratch surface is the same kind
 * of thing: switching org does not hand you a different pad. It is keyed by
 * user so that two people signing in to the same browser do not draw on each
 * other's board.
 *
 * `$lib/theme.svelte.ts` is the pattern for the storage and
 * `$lib/breadcrumbs.svelte.ts` for reading it back safely — validated on the
 * way in, an empty board rather than a throw when it does not parse.
 */

const STORAGE_PREFIX = 'whiteboard:';

/**
 * How many steps back `undo` reaches. In memory only: history is the shape of
 * this sitting rather than part of the drawing, so a reload opens the board
 * as it was last left with nothing to undo.
 */
const HISTORY_LIMIT = 50;

export function createBoard(scope: string) {
	const key = STORAGE_PREFIX + scope;

	let scene = $state<Scene>(browser ? parseScene(read(key)) : EMPTY_SCENE);
	let past = $state<Scene[]>([]);

	/** Every change goes through here: one step of history, one write. */
	function commit(next: Scene): void {
		past = [...past.slice(1 - HISTORY_LIMIT), scene];
		scene = next;
		write(key, next);
	}

	return {
		get elements(): readonly WhiteboardElement[] {
			return scene.elements;
		},

		get canUndo(): boolean {
			return past.length > 0;
		},

		/**
		 * Add an element, or replace the one that already carries its id —
		 * which is what moving and re-wording one are. A replacement keeps its
		 * place in the order, so nudging a shape never brings it to the front.
		 */
		put(element: WhiteboardElement): void {
			const known = scene.elements.some((existing) => existing.id === element.id);
			const elements = known
				? scene.elements.map((existing) => (existing.id === element.id ? element : existing))
				: [...scene.elements, element];
			commit({ ...scene, elements });
		},

		remove(id: string): void {
			if (!scene.elements.some((element) => element.id === id)) return;
			commit({ ...scene, elements: scene.elements.filter((element) => element.id !== id) });
		},

		/** Wipe the board — undoable, like every other change. */
		clear(): void {
			if (scene.elements.length === 0) return;
			commit({ ...scene, elements: [] });
		},

		undo(): void {
			const previous = past.at(-1);
			if (!previous) return;
			past = past.slice(0, -1);
			scene = previous;
			write(key, previous);
		}
	};
}

/** Storage is absent on the server and throws in some private modes. */
function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, scene: Scene): void {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify(scene));
	} catch {
		// Storage disabled, or a board bigger than the quota. The drawing on
		// screen is still the drawing; it just will not be here next time.
	}
}
