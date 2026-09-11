import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

type Getter<T> = () => T;

/** Where a card ended up: which card, and the column it was released over. */
export type KanbanMove = (cardId: string, column: string) => void;

export type KanbanStateProps = {
	/**
	 * Getters rather than raw values, for the reason `Sidebar.Provider` uses
	 * them: `Kanban.Root` stays the single source of truth, and a handler
	 * copied at construction would keep calling the load's first data.
	 */
	onmove: Getter<KanbanMove | undefined>;
	/** Freezes the board: cards stop lifting and leave the tab order. */
	disabled: Getter<boolean>;
};

/**
 * Pixels of travel before a press becomes a lift, so a click on a card still
 * reaches the link inside it. The same threshold `ReorderList` uses — a board
 * and a list should not disagree about what counts as a drag.
 */
const LIFT = 3;

/**
 * Coordination state only: which card is in the air, where the pointer is, and
 * which column it is over. The cards themselves are the page's data and never
 * enter here — a column is told its own key and renders the cards the page put
 * inside it.
 */
class KanbanState {
	readonly props: KanbanStateProps;

	/** The card in the air, and the column it was lifted out of. */
	dragging = $state<{ id: string; from: string } | null>(null);
	/** Viewport coordinates of the pointer, for the card that follows it. */
	pointer = $state({ x: 0, y: 0 });
	/** The column under the pointer — where a release would drop the card. */
	over = $state<string | null>(null);
	/** The card the keyboard is carrying, for the drag-free way to move one. */
	grabbed = $state<string | null>(null);
	/** What a screen reader is told about the move in progress. */
	spoken = $state('');

	/**
	 * Every column's element and label, keyed by the column's value, written by
	 * each column's attachment as it mounts. Reactive so that `columnValues` —
	 * the order the arrow keys walk — is read back correctly however the board
	 * is rendered.
	 */
	readonly #columns = new SvelteMap<string, { el: HTMLElement; label: string }>();

	/** The card a press has armed, and where the press landed. */
	#armed: { id: string; from: string; x: number; y: number } | null = null;

	constructor(props: KanbanStateProps) {
		this.props = props;
	}

	get disabled(): boolean {
		return this.props.disabled();
	}

	/** The columns in the order they registered — the order they are on screen. */
	get columnValues(): string[] {
		return [...this.#columns.keys()];
	}

	registerColumn(value: string, el: HTMLElement, label: string): () => void {
		this.#columns.set(value, { el, label });
		return () => this.#columns.delete(value);
	}

	labelOf(value: string | null): string {
		return value === null ? '' : (this.#columns.get(value)?.label ?? value);
	}

	isDragging(cardId: string): boolean {
		return this.dragging?.id === cardId;
	}

	isOver(column: string): boolean {
		return this.dragging !== null && this.over === column;
	}

	/** The column whose box contains this point, or null between columns. */
	#columnAt(x: number, y: number): string | null {
		for (const [value, { el }] of this.#columns) {
			const box = el.getBoundingClientRect();
			if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return value;
		}
		return null;
	}

	/**
	 * Arms a press. The lift itself waits for the pointer to travel `LIFT`, so
	 * a click that never moves stays a click and the card's link still opens.
	 */
	press = (event: PointerEvent, cardId: string, column: string): void => {
		if (this.disabled) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		// A press that lands on something interactive belongs to that thing —
		// except the card's own handle, which is interactive precisely so that
		// it can be dragged.
		// SAFETY: a pointerdown on a card dispatches from an element inside it;
		// `closest` is all that is asked of it, and a non-element target would
		// not have reached this handler.
		const target = event.target as HTMLElement;
		if (!target.closest('[data-kanban-handle]')) {
			if (target.closest('a, button, input, select, textarea')) return;
		}
		this.#armed = { id: cardId, from: column, x: event.clientX, y: event.clientY };

		const move = (moving: PointerEvent) => this.#move(moving);
		const release = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', release);
			window.removeEventListener('pointercancel', release);
			this.#release();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', release);
		window.addEventListener('pointercancel', release);
	};

	#move(event: PointerEvent): void {
		const armed = this.#armed;
		if (!armed) return;
		if (!this.dragging) {
			const travelled = Math.hypot(event.clientX - armed.x, event.clientY - armed.y);
			if (travelled < LIFT) return;
			this.dragging = { id: armed.id, from: armed.from };
		}
		// Text selection across the board while a card is in the air reads as a
		// broken drag, and there is no gesture it could belong to.
		event.preventDefault();
		this.pointer = { x: event.clientX, y: event.clientY };
		this.over = this.#columnAt(event.clientX, event.clientY);
	}

	#release(): void {
		const dragged = this.dragging;
		const landed = this.over;
		this.#armed = null;
		this.dragging = null;
		this.over = null;
		if (!dragged || !landed || landed === dragged.from) return;
		this.props.onmove()?.(dragged.id, landed);
	}

	/**
	 * The keyboard's way across the board: space picks a card up, the arrows
	 * move it a column at a time, escape puts it back. A drag that only a
	 * pointer can do is a board only some people can use.
	 */
	keydown = (event: KeyboardEvent, cardId: string, column: string, label: string): void => {
		if (this.disabled) return;
		const held = this.grabbed === cardId;

		if (event.key === ' ' || event.key === 'Enter') {
			// Enter on a card that is not held belongs to the link inside it.
			if (!held && event.key === 'Enter') return;
			event.preventDefault();
			this.grabbed = held ? null : cardId;
			this.spoken = held
				? `${label} dropped in ${this.labelOf(column)}.`
				: `${label} grabbed, in ${this.labelOf(column)}. Use the left and right arrows to move it.`;
			return;
		}
		if (!held) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const order = this.columnValues;
			const to = order[order.indexOf(column) + (event.key === 'ArrowLeft' ? -1 : 1)];
			if (to === undefined) return;
			this.spoken = `${label} moved to ${this.labelOf(to)}.`;
			this.props.onmove()?.(cardId, to);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			this.grabbed = null;
			this.spoken = `${label} dropped in ${this.labelOf(column)}.`;
		}
	};
}

const SYMBOL_KEY = 'app-kanban';

export function setKanban(props: KanbanStateProps): KanbanState {
	return setContext(Symbol.for(SYMBOL_KEY), new KanbanState(props));
}

/** This is a class instance, so consumers must not destructure it. */
export function useKanban(): KanbanState {
	const state = getContext<KanbanState | undefined>(Symbol.for(SYMBOL_KEY));
	if (!state) throw new Error('Kanban.* parts must be used inside <Kanban.Root>.');
	return state;
}

export type { KanbanState };
