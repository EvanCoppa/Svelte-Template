import { getContext, setContext, type Snippet } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

type Getter<T> = () => T;

/** Where a card ended up: which card, and the status it was released over. */
export type KanbanMove = (cardId: string, status: string) => void;

/**
 * One of the states a column holds. A board has two axes — the column is the
 * coarse one a reader scans, the status the fine one the work is actually in —
 * and this is the fine one: its value is what `onmove` is called with, and its
 * label is what a screen reader is told when the keyboard carries a card into
 * it.
 */
export type KanbanStatus = {
	value: string;
	label: string;
};

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

/** A zone's key. Two columns may hold statuses of the same name. */
function zoneKey(column: string, status: string): string {
	return `${column} ${status}`;
}

/**
 * Coordination state only: which card is in the air, where the pointer is, and
 * which column — and which status inside it — the pointer is over. The cards
 * themselves are the page's data and never enter here; the one exception is
 * the snippet a card is drawn with, which the board borrows while that card is
 * in the air so the thing under the pointer is the card rather than an outline
 * of it. It is held here rather than rendered by the card because a column
 * that splits into drop zones unmounts its cards, and what you are carrying
 * must not vanish because of where you carried it.
 */
class KanbanState {
	readonly props: KanbanStateProps;

	/** The card in the air, and the status it was lifted out of. */
	dragging = $state<{ id: string; from: string } | null>(null);
	/** How to draw the card under the pointer — the lifted card's own snippet. */
	carried = $state<Snippet | undefined>(undefined);
	/** Viewport coordinates of the pointer, for the card that follows it. */
	pointer = $state({ x: 0, y: 0 });
	/** The column under the pointer. */
	over = $state<string | null>(null);
	/** The status zone under the pointer, in a column that holds more than one. */
	overStatus = $state<string | null>(null);
	/** The card the keyboard is carrying, for the drag-free way to move one. */
	grabbed = $state<string | null>(null);
	/** What a screen reader is told about the move in progress. */
	spoken = $state('');
	/**
	 * The height the board had when the card was picked up, held until it is
	 * put down. A column that splits swaps five cards for four drop zones, so
	 * the tallest column on the board can collapse mid-drag — which drops the
	 * pointer out of the column it was over, un-splits it, puts it back under
	 * the pointer, and flickers between the two forever. Measured on the press,
	 * while the board is still whole, and applied as a floor: the board may
	 * still grow to take a placeholder, it just cannot shrink under your hand.
	 */
	frozenHeight = $state<number | null>(null);

	/**
	 * Every column's element, label and statuses, keyed by the column's value,
	 * written by each column's attachment as it mounts. Reactive so that
	 * `statusOrder` — the order the arrow keys walk — is read back correctly
	 * however the board is rendered.
	 */
	readonly #columns = new SvelteMap<
		string,
		{ el: HTMLElement; label: string; statuses: Getter<readonly KanbanStatus[]> }
	>();

	/** Each split column's drop zones, for the finer hit test inside one column. */
	readonly #zones = new SvelteMap<string, { el: HTMLElement; status: string }>();

	/** The board's own element, measured on a press and nothing else. */
	#board: HTMLElement | null = null;

	/** The card a press has armed, where the press landed, and how to draw it. */
	#armed: { id: string; from: string; x: number; y: number; ghost: Snippet | undefined } | null =
		null;

	constructor(props: KanbanStateProps) {
		this.props = props;
	}

	get disabled(): boolean {
		return this.props.disabled();
	}

	registerBoard(el: HTMLElement): () => void {
		this.#board = el;
		return () => {
			if (this.#board === el) this.#board = null;
		};
	}

	registerColumn(
		value: string,
		el: HTMLElement,
		label: string,
		statuses: Getter<readonly KanbanStatus[]>
	): () => void {
		this.#columns.set(value, { el, label, statuses });
		return () => this.#columns.delete(value);
	}

	registerZone(column: string, status: string, el: HTMLElement): () => void {
		const key = zoneKey(column, status);
		this.#zones.set(key, { el, status });
		return () => this.#zones.delete(key);
	}

	/** The states one column holds, in the order the page listed them. */
	statusesOf(column: string | null): readonly KanbanStatus[] {
		return column === null ? [] : (this.#columns.get(column)?.statuses() ?? []);
	}

	/**
	 * Every status on the board, left to right — the order the arrow keys walk.
	 * It crosses column boundaries on purpose: a status the keyboard cannot
	 * reach is a status only a pointer can choose.
	 */
	get statusOrder(): KanbanStatus[] {
		return [...this.#columns.values()].flatMap(({ statuses }) => [...statuses()]);
	}

	labelOf(column: string | null): string {
		return column === null ? '' : (this.#columns.get(column)?.label ?? column);
	}

	statusLabel(status: string): string {
		return this.statusOrder.find((entry) => entry.value === status)?.label ?? status;
	}

	isDragging(cardId: string): boolean {
		return this.dragging?.id === cardId;
	}

	isOver(column: string): boolean {
		return this.dragging !== null && this.over === column;
	}

	/**
	 * Whether this column is showing its statuses instead of its cards: a card
	 * is over it and it holds more than one state, so where the card lands is a
	 * question only the person dragging it can answer.
	 */
	splitting(column: string): boolean {
		return this.isOver(column) && this.statusesOf(column).length > 1;
	}

	isOverStatus(status: string): boolean {
		return this.dragging !== null && this.overStatus === status;
	}

	/**
	 * Whether a release here would move the card — a column already holding the
	 * status it has is a drop back, and says nothing. Answers the dashed gap a
	 * single-status column shows while a card hovers over it.
	 */
	wouldTake(column: string): boolean {
		const from = this.dragging?.from;
		if (from === undefined || !this.isOver(column) || this.splitting(column)) return false;
		return !this.statusesOf(column).some((status) => status.value === from);
	}

	/** The column whose box contains this point, or null between columns. */
	#columnAt(x: number, y: number): string | null {
		for (const [value, { el }] of this.#columns) {
			const box = el.getBoundingClientRect();
			if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return value;
		}
		return null;
	}

	/** The zone of this column whose box contains this point. */
	#zoneAt(column: string, x: number, y: number): string | null {
		for (const [key, { el, status }] of this.#zones) {
			if (!key.startsWith(`${column} `)) continue;
			const box = el.getBoundingClientRect();
			if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return status;
		}
		return null;
	}

	/**
	 * The status a release would write: a column holding one is that one, and a
	 * column holding several is whichever zone the pointer is in — never a
	 * guess, because landing a blocked task in "in progress" because that zone
	 * happened to be first is worse than nothing happening.
	 */
	#targetStatus(): string | null {
		const statuses = this.statusesOf(this.over);
		if (statuses.length === 0) return null;
		if (statuses.length === 1) return statuses[0].value;
		return this.overStatus;
	}

	/**
	 * Arms a press. The lift itself waits for the pointer to travel `LIFT`, so
	 * a click that never moves stays a click and the card's link still opens.
	 */
	press = (event: PointerEvent, cardId: string, status: string, ghost?: Snippet): void => {
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
		this.#armed = { id: cardId, from: status, x: event.clientX, y: event.clientY, ghost };
		this.frozenHeight = this.#board?.getBoundingClientRect().height ?? null;

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
			this.carried = armed.ghost;
		}
		// Text selection across the board while a card is in the air reads as a
		// broken drag, and there is no gesture it could belong to.
		event.preventDefault();
		this.pointer = { x: event.clientX, y: event.clientY };
		const column = this.#columnAt(event.clientX, event.clientY);
		this.over = column;
		// The zones only exist while a column is split, which is why this is
		// asked after the column rather than alongside it.
		this.overStatus =
			column !== null && this.statusesOf(column).length > 1
				? this.#zoneAt(column, event.clientX, event.clientY)
				: null;
	}

	#release(): void {
		const dragged = this.dragging;
		const landed = this.#targetStatus();
		this.#armed = null;
		this.dragging = null;
		this.carried = undefined;
		this.over = null;
		this.overStatus = null;
		this.frozenHeight = null;
		if (!dragged || landed === null || landed === dragged.from) return;
		this.props.onmove()?.(dragged.id, landed);
	}

	/**
	 * The keyboard's way across the board: space picks a card up, the arrows
	 * move it a status at a time, escape puts it back. A drag that only a
	 * pointer can do is a board only some people can use — and the arrows walk
	 * statuses rather than columns, so the fine axis is reachable both ways.
	 */
	keydown = (event: KeyboardEvent, cardId: string, status: string, label: string): void => {
		if (this.disabled) return;
		const held = this.grabbed === cardId;

		if (event.key === ' ' || event.key === 'Enter') {
			// Enter on a card that is not held belongs to the link inside it.
			if (!held && event.key === 'Enter') return;
			event.preventDefault();
			this.grabbed = held ? null : cardId;
			this.spoken = held
				? `${label} dropped in ${this.statusLabel(status)}.`
				: `${label} grabbed, in ${this.statusLabel(status)}. Use the left and right arrows to move it.`;
			return;
		}
		if (!held) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const order = this.statusOrder;
			const at = order.findIndex((entry) => entry.value === status);
			const to = order[at + (event.key === 'ArrowLeft' ? -1 : 1)];
			if (at === -1 || to === undefined) return;
			this.spoken = `${label} moved to ${to.label}.`;
			this.props.onmove()?.(cardId, to.value);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			this.grabbed = null;
			this.spoken = `${label} dropped in ${this.statusLabel(status)}.`;
		}
	};
}

const SYMBOL_KEY = 'app-kanban';
const COLUMN_KEY = 'app-kanban-column';

export function setKanban(props: KanbanStateProps): KanbanState {
	return setContext(Symbol.for(SYMBOL_KEY), new KanbanState(props));
}

/** This is a class instance, so consumers must not destructure it. */
export function useKanban(): KanbanState {
	const state = getContext<KanbanState | undefined>(Symbol.for(SYMBOL_KEY));
	if (!state) throw new Error('Kanban.* parts must be used inside <Kanban.Root>.');
	return state;
}

/**
 * Which column a part is inside, so the zones, the cards and the gap between
 * them are not each told again what the column around them already said. A
 * getter, so a column whose value changes is never read stale.
 */
export type KanbanColumnContext = { readonly value: string };

export function setKanbanColumn(value: Getter<string>): void {
	setContext<KanbanColumnContext>(Symbol.for(COLUMN_KEY), {
		get value() {
			return value();
		}
	});
}

export function useKanbanColumn(): KanbanColumnContext {
	const column = getContext<KanbanColumnContext | undefined>(Symbol.for(COLUMN_KEY));
	if (!column) throw new Error('This Kanban.* part must be used inside <Kanban.Column>.');
	return column;
}

export type { KanbanState };
