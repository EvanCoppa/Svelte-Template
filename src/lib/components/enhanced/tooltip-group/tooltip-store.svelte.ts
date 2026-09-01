import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

export interface TooltipTiming {
	/** Milliseconds a cold pointer must rest on a trigger before its tooltip opens. */
	openDelay: number;
	/** Grace period after the pointer leaves, so crossing a 2px seam does not blink. */
	closeDelay: number;
	/** How long the group stays warm after the last tooltip closes. While warm, openDelay is zero. */
	skipDelay: number;
}

type Timer = ReturnType<typeof setTimeout> | null;

function stopTimer(timer: Timer): Timer {
	if (timer !== null) clearTimeout(timer);
	return null;
}

/**
 * The single seat every tooltip in a group competes for.
 *
 * Only one id can be active at a time, so an outgoing close timer and an incoming
 * open can never overlap into two tooltips on screen. The delay is charged once
 * per visit rather than once per trigger: the first tooltip waits `openDelay`,
 * and while the group is warm every sibling arrives on contact until the pointer
 * has been away for `skipDelay`.
 */
export class TooltipStore {
	#getTiming: () => TooltipTiming;
	#pending: string | null = null;
	#blocked: string | null = null;
	#lastX: number | null = null;
	#openTimer: Timer = null;
	#closeTimer: Timer = null;
	#coolTimer: Timer = null;
	#measurers = new SvelteMap<string, () => DOMRect | null>();
	#handOff: DOMRect | null = null;

	/** The one tooltip currently on screen. */
	active = $state<string | null>(null);
	/** True while the group is still hot from the last tooltip. */
	warm = $state(false);
	/** Whether the tooltip on screen arrived without paying the open delay. */
	skipped = $state(false);
	/** -1, 0 or 1 — which way the pointer was travelling when the tooltip opened. */
	travel = $state(0);

	constructor(getTiming: () => TooltipTiming) {
		this.#getTiming = getTiming;
	}

	/** Lets a tooltip hand its resting rect to whichever tooltip replaces it. */
	register(id: string, measure: () => DOMRect | null) {
		this.#measurers.set(id, measure);
	}

	unregister(id: string) {
		this.#measurers.delete(id);
	}

	/** The outgoing tooltip's rect, consumed once by the tooltip taking its place. */
	takeRect(): DOMRect | null {
		const rect = this.#handOff;
		this.#handOff = null;
		return rect;
	}

	#setActive(next: string | null) {
		if (this.active === next) return;
		if (next !== null) {
			this.skipped = this.warm;
			this.warm = true;
			this.#handOff = this.active !== null ? (this.#measurers.get(this.active)?.() ?? null) : null;
		}
		this.active = next;
	}

	#cool() {
		this.#coolTimer = stopTimer(this.#coolTimer);
		const { skipDelay } = this.#getTiming();
		if (skipDelay <= 0) {
			this.warm = false;
			return;
		}
		this.#coolTimer = setTimeout(() => {
			this.#coolTimer = null;
			this.warm = false;
		}, skipDelay);
	}

	open(id: string, immediate: boolean, x?: number) {
		if (this.#blocked === id) return;
		this.#closeTimer = stopTimer(this.#closeTimer);
		this.#coolTimer = stopTimer(this.#coolTimer);

		if (this.active === id) {
			this.#openTimer = stopTimer(this.#openTimer);
			this.#pending = null;
			return;
		}

		const arrive = () => {
			this.travel = this.#lastX !== null && x !== undefined ? Math.sign(x - this.#lastX) : 0;
			this.#lastX = x ?? null;
			this.#setActive(id);
		};

		if (immediate || this.warm) {
			this.#openTimer = stopTimer(this.#openTimer);
			this.#pending = null;
			arrive();
			return;
		}

		this.#openTimer = stopTimer(this.#openTimer);
		this.#pending = id;
		this.#openTimer = setTimeout(() => {
			this.#openTimer = null;
			this.#pending = null;
			arrive();
		}, this.#getTiming().openDelay);
	}

	close(id: string, immediate: boolean) {
		if (this.#pending === id) {
			this.#openTimer = stopTimer(this.#openTimer);
			this.#pending = null;
		}
		if (this.active !== id) return;

		this.#closeTimer = stopTimer(this.#closeTimer);
		const finish = () => {
			this.#closeTimer = null;
			this.#setActive(null);
			this.#cool();
		};

		if (immediate || this.#getTiming().closeDelay <= 0) {
			finish();
			return;
		}
		this.#closeTimer = setTimeout(finish, this.#getTiming().closeDelay);
	}

	/** Escape: closes now and blocks this trigger until the pointer actually leaves. */
	dismiss(id: string) {
		this.#blocked = id;
		this.#openTimer = stopTimer(this.#openTimer);
		this.#closeTimer = stopTimer(this.#closeTimer);
		this.#coolTimer = stopTimer(this.#coolTimer);
		this.#pending = null;
		this.warm = false;
		if (this.active === id) this.#setActive(null);
	}

	unblock(id: string) {
		if (this.#blocked === id) this.#blocked = null;
	}

	/** The window lost focus or the tab went away: forget everything, stay silent. */
	reset() {
		this.#openTimer = stopTimer(this.#openTimer);
		this.#closeTimer = stopTimer(this.#closeTimer);
		this.#coolTimer = stopTimer(this.#coolTimer);
		this.#pending = null;
		this.#blocked = null;
		this.#lastX = null;
		this.travel = 0;
		this.warm = false;
		if (this.active !== null) this.#setActive(null);
	}

	dispose() {
		this.#openTimer = stopTimer(this.#openTimer);
		this.#closeTimer = stopTimer(this.#closeTimer);
		this.#coolTimer = stopTimer(this.#coolTimer);
		this.#measurers.clear();
	}
}

const GROUP_KEY = Symbol('interior.tooltip-group');

/** Called by `TooltipGroup` during init so its descendants share one seat. */
export function provideTooltipGroup(store: TooltipStore) {
	setContext(GROUP_KEY, store);
}

/** Returns the enclosing group's store, or null for a tooltip standing alone. */
export function useTooltipGroup(): TooltipStore | null {
	return getContext<TooltipStore | undefined>(GROUP_KEY) ?? null;
}
