<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The face dropping into the well and leaning toward the press. */
	const PRESS = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

	export type PressOrigin = { x: number; y: number };

	export interface PressDepthProps extends Omit<
		HTMLButtonAttributes,
		'children' | 'disabled' | 'type' | 'onpointerdown' | 'onkeydown' | 'onkeyup' | 'onblur'
	> {
		children?: Snippet;
		/** Travel in pixels, reserved as bottom padding before the first press so the footprint never changes. */
		depth?: number;
		/** Maximum lean in degrees, away from the corner the pointer landed on. */
		tilt?: number;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		/** Fires once when the key goes down — including when a pointer returns to it mid-hold. */
		onPressStart?: () => void;
		/** Fires once when the key comes back up, whatever released it. */
		onPressEnd?: () => void;
	}

	let {
		class: className,
		children,
		depth = 4,
		tilt = 7,
		disabled = false,
		type = 'button',
		onPressStart,
		onPressEnd,
		...restProps
	}: PressDepthProps = $props();

	let node = $state<HTMLButtonElement | null>(null);
	let pressed = $state(false);
	let tracking = $state(false);
	let origin = $state<PressOrigin | null>(null);
	let pointerId: number | null = null;

	function setDown(next: boolean) {
		if (pressed === next) return;
		pressed = next;
		if (next) onPressStart?.();
		else onPressEnd?.();
	}

	function stop() {
		pointerId = null;
		tracking = false;
		origin = null;
		setDown(false);
	}

	// A disabled prop arriving mid-hold has to release the key rather than strand it down.
	$effect(() => {
		if (disabled) stop();
	});

	function inside(event: PointerEvent): boolean {
		if (!node) return false;
		const r = node.getBoundingClientRect();
		return (
			event.clientX >= r.left &&
			event.clientX <= r.right &&
			event.clientY >= r.top &&
			event.clientY <= r.bottom
		);
	}

	function handleWindowPointerMove(event: PointerEvent) {
		if (!tracking || event.pointerId !== pointerId) return;
		setDown(inside(event));
	}

	function handleWindowPointerUp(event: PointerEvent) {
		if (!tracking || event.pointerId !== pointerId) return;
		stop();
	}

	function handleWindowBlur() {
		if (tracking) stop();
	}

	function handleVisibilityChange() {
		if (tracking && document.hidden) stop();
	}

	function handlePointerDown(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (disabled) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;

		const r = event.currentTarget.getBoundingClientRect();
		origin = {
			x: Math.max(-1, Math.min(1, ((event.clientX - r.left) / r.width) * 2 - 1)),
			y: Math.max(-1, Math.min(1, ((event.clientY - r.top) / r.height) * 2 - 1))
		};
		pointerId = event.pointerId;
		tracking = true;
		setDown(true);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (disabled || event.repeat) return;
		if (event.key === ' ' || event.key === 'Enter') setDown(true);
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.key === ' ' || event.key === 'Enter' || event.key === 'Escape') setDown(false);
	}

	const lean = $derived(pressed && origin && !reducedMotion.current ? origin : null);

	const face = $derived({
		// Motion writes the perspective into the same transform it builds, so it
		// has to travel with the rotation rather than sit in a CSS rule.
		transformPerspective: 340,
		y: pressed ? depth : 0,
		rotateX: lean ? -lean.y * tilt : 0,
		rotateY: lean ? lean.x * tilt : 0
	});
</script>

<svelte:window
	onpointermove={handleWindowPointerMove}
	onpointerup={handleWindowPointerUp}
	onpointercancel={handleWindowPointerUp}
	onblur={handleWindowBlur}
/>
<svelte:document onvisibilitychange={handleVisibilityChange} />

<button
	{...restProps}
	bind:this={node}
	{type}
	{disabled}
	data-slot="press-depth"
	data-pressed={pressed ? '' : undefined}
	style:padding-bottom="{depth}px"
	class="group relative inline-flex touch-manipulation rounded-[9px] align-middle outline-none select-none [-webkit-tap-highlight-color:transparent] disabled:opacity-50"
	onpointerdown={handlePointerDown}
	onkeydown={handleKeyDown}
	onkeyup={handleKeyUp}
	onblur={stop}
>
	<span
		aria-hidden="true"
		style:top="{depth}px"
		class="bg-foreground/20 absolute inset-x-0 bottom-0 rounded-[9px]"
	></span>

	<span
		style:transform-origin="center top"
		{@attach motionTo(() => ({ keyframes: face, transition: PRESS }))}
		class={cn(
			'border-border bg-card text-foreground group-focus-visible:ring-ring/50 relative inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border px-3.5 text-[13px] font-medium group-focus-visible:ring-2',
			className
		)}
	>
		<span
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 rounded-[9px] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]"
			{@attach motionTo(() => ({ keyframes: { opacity: pressed ? 0 : 1 }, transition: PRESS }))}
		></span>
		{@render children?.()}
	</span>
</button>
