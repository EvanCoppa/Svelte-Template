/**
 * Motion helpers shared by the enhanced primitives in
 * `src/lib/components/enhanced/`. Ported from Solid Core so both repos animate
 * the same things at the same rate.
 *
 * Everything here is client-only by construction: Svelte transition, animate
 * and attachment functions never run during the server render, so a component
 * may reach for these at the top level of its markup without a guard.
 */

import { animate, press } from 'motion';
import type { AnimationOptions, AnimationPlaybackControls, DOMKeyframesDefinition } from 'motion';
import type { Attachment } from 'svelte/attachments';
import { MediaQuery } from 'svelte/reactivity';
import type { TransitionConfig } from 'svelte/transition';

/**
 * Whether the platform has asked for less motion. Rune-backed, so reading
 * `.current` inside a component or an effect re-runs it when the setting flips
 * mid-session rather than only at load.
 */
export const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce', false);

/**
 * The spring presets the components share, so two components animating the same
 * kind of thing settle at the same rate.
 */
export const springs = {
	/** Panels, rows, anything with area. Settles without overshoot. */
	settle: { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 },
	/** Indicators and small chrome that has to keep up with a pointer. */
	snap: { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 },
	/** Welded to the input: the stiffest of the set, for press states. */
	tight: { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 },
	/** Under-damped on purpose. Overshoots, for celebratory beats. */
	bouncy: { type: 'spring', stiffness: 640, damping: 22, mass: 0.7 },
	/** Large surfaces that should read as heavy. */
	glide: { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 }
} as const satisfies Record<string, AnimationOptions>;

/** How long Motion says an animation runs, in milliseconds, delay included. */
export function durationOf(controls: AnimationPlaybackControls): number {
	const seconds = controls.iterationDuration ?? controls.duration;
	return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

export interface MotionAnimation {
	/** Passed straight to Motion. Use array values to state the from and the to. */
	keyframes: DOMKeyframesDefinition;
	/** Passed straight to Motion. Defaults to `springs.settle`. */
	transition?: AnimationOptions;
}

export interface MotionTransitionParams extends MotionAnimation {
	/**
	 * Played instead when the platform has asked for less motion. Omit it and the
	 * element simply appears — but a plain opacity fade is usually still welcome,
	 * and this is where it goes.
	 */
	reduced?: MotionAnimation;
}

/**
 * A Svelte transition that hands the animating to Motion.
 *
 * Svelte owns the DOM lifecycle and Motion owns the frames: the returned config
 * carries no `css` or `tick`, only the duration Motion reports back, so the node
 * stays mounted exactly as long as the animation runs. That is what lets a
 * spring exit finish instead of being cut off at a guessed millisecond count.
 *
 * ```svelte
 * {#if open}
 *   <div in:motionTransition={{ keyframes: { opacity: [0, 1], y: [8, 0] } }}></div>
 * {/if}
 * ```
 */
export function motionTransition(node: Element, params: MotionTransitionParams): TransitionConfig {
	const spec = reducedMotion.current ? params.reduced : params;
	if (!spec) return { duration: 0 };

	const controls = animate(node, spec.keyframes, spec.transition ?? springs.settle);
	return { duration: durationOf(controls) };
}

/**
 * A Motion-powered stand-in for `animate:flip`. The element is animated from the
 * offset it used to occupy back to zero, which is exactly what Motion's `layout`
 * prop does for a position-only layout change.
 *
 * ```svelte
 * {#each rows as row (row.id)}
 *   <li animate:motionFlip={{ transition: springs.snap }}></li>
 * {/each}
 * ```
 */
export function motionFlip(
	node: Element,
	{ from, to }: { from: DOMRect; to: DOMRect },
	params: { transition?: AnimationOptions } = {}
): TransitionConfig {
	const dx = from.left - to.left;
	const dy = from.top - to.top;
	if (reducedMotion.current || (dx === 0 && dy === 0)) return { duration: 0 };

	const controls = animate(node, { x: [dx, 0], y: [dy, 0] }, params.transition ?? springs.snap);
	return { duration: durationOf(controls) };
}

/**
 * A Motion-driven collapse, for blocks whose open height is `auto`.
 *
 * Motion cannot animate to `auto` outside its React components, so the height
 * is measured off the node the moment the transition starts and the animation
 * runs between that and zero. The inline height is cleared once an opening
 * settles, so the block goes back to sizing itself and content that grows later
 * is not clipped to the height it happened to have when it opened.
 */
export function motionCollapse(
	node: Element,
	params: { transition?: AnimationOptions } = {},
	options: { direction?: 'in' | 'out' | 'both' } = {}
): TransitionConfig {
	if (reducedMotion.current) return { duration: 0 };

	// SAFETY: this transition only ever runs on block elements passed in:out/in from markup,
	// never on SVG nodes, so the CSSOM `style.height` write below is always valid.
	const el = node as HTMLElement;
	const closing = options.direction === 'out';
	const open = `${el.scrollHeight}px`;

	const controls = animate(
		el,
		{ height: closing ? [open, '0px'] : ['0px', open] },
		{
			...(params.transition ?? springs.settle),
			onComplete: closing ? undefined : () => (el.style.height = '')
		}
	);
	return { duration: durationOf(controls) };
}

const placed = new WeakSet<Element>();

/**
 * Holds an element at whatever target the callback returns, re-animating from
 * wherever the element currently sits each time that target changes. This is the
 * imperative twin of Motion's declarative `animate` prop, and it inherits the
 * useful half of that behaviour: a change that lands mid-flight is picked up
 * from the current position rather than restarted from the old one.
 *
 * By default the first run is instant and reduced motion pins every run to its
 * end state — an element should start where it belongs, and only later changes
 * animate. Pass `initial: true` when the entrance itself is the point; the
 * callback then owns the whole animation, reduced motion included.
 *
 * ```svelte
 * <span {@attach motionTo(() => ({ keyframes: { y: index * ROW } }))}></span>
 * ```
 */
export function motionTo(
	spec: () => MotionAnimation,
	{ initial = false }: { initial?: boolean } = {}
): Attachment<Element> {
	return (node) => {
		const { keyframes, transition } = spec();
		const first = !placed.has(node);
		placed.add(node);

		const instant = !initial && (reducedMotion.current || first);
		const controls = animate(
			node,
			keyframes,
			instant ? { duration: 0 } : (transition ?? springs.settle)
		);
		return () => controls.stop();
	};
}

/**
 * Motion's `whileTap`, as an attachment. The element animates to `pressed`
 * while a press is held and back to `released` when it ends — including when the
 * press ends off the element or is cancelled, which is the half a plain
 * `:active` rule gets wrong.
 */
export function motionPress(
	pressed: DOMKeyframesDefinition,
	released: DOMKeyframesDefinition,
	transition?: AnimationOptions
): Attachment<Element> {
	return (node) => {
		if (reducedMotion.current) return;
		return press(node, (element) => {
			const held = animate(element, pressed, transition ?? springs.snap);
			return () => {
				held.stop();
				animate(element, released, transition ?? springs.snap);
			};
		});
	};
}

/**
 * Plays a Motion animation when the element attaches, and stops it if the
 * element leaves mid-flight. For entrances that do not need Svelte to hold the
 * node open — `{@attach motionEnter({ opacity: [0, 1] })}`.
 */
export function motionEnter(
	keyframes: DOMKeyframesDefinition,
	transition?: AnimationOptions
): Attachment<Element> {
	return (node) => {
		if (reducedMotion.current) return;
		const controls = animate(node, keyframes, transition ?? springs.settle);
		return () => controls.stop();
	};
}

/**
 * How far a hidden label layer softens. Solid Core's interior buttons use 3px,
 * which smears a 13px label; this is the one place to tune it for every button.
 */
const LABEL_SWAP_BLUR = 'blur(1.5px)';

/**
 * Keyframes for one layer of a label swap — the "labels trade places" beat a
 * button plays when its text changes with its state (idle → saving → saved).
 * Every layer sits in the same grid cell; the one being shown settles into
 * place while the one being hidden drops a few pixels and softens. Pair it with
 * `motionTo` and `springs.settle`:
 *
 * ```svelte
 * <span {@attach motionTo(() => ({ keyframes: labelSwap(status === 'idle') }))}>Save</span>
 * ```
 */
export function labelSwap(visible: boolean): DOMKeyframesDefinition {
	return visible
		? { opacity: 1, y: 0, filter: 'blur(0px)' }
		: { opacity: 0, y: 3, filter: LABEL_SWAP_BLUR };
}
