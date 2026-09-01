<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	/** The fold itself, and the body sliding under the header. */
	const DISCLOSE = { type: 'spring', stiffness: 190, damping: 30, mass: 1 } as const;
	/** The caret flipping over. */
	const NUDGE = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

	export type BannerState = 'open' | 'folded' | 'dismissed';

	export interface CollapsibleBannerProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children' | 'title'
	> {
		/** The one line the banner exists to say, and the only thing left when folded. */
		title: string;
		/** The part that folds away. Omitted entirely rather than reserved as empty space. */
		description?: string;
		/** Extra content below the description, inside the fold. */
		children?: Snippet;
		/** The control the notice is asking for, at the bottom of the fold. */
		action?: Snippet;
		/** Replaces the leading mark. */
		icon?: Snippet;
		/** False removes the close button and leaves only the fold. */
		dismissible?: boolean;
		/** Bindable state. Pass it to control the banner from outside. */
		state?: BannerState;
		/** Uncontrolled starting state. Starting folded costs no flash. */
		defaultState?: BannerState;
		/** Fires on every transition, so a folded notice can be remembered per user. */
		onStateChange?: (state: BannerState) => void;
		/** Fires only on dismiss, once. */
		onDismiss?: () => void;
		/** Accessible name of the close button. */
		dismissLabel?: string;
		/** Announced once, from a live region outside the collapsing frame. */
		dismissedMessage?: string;
	}

	let {
		class: className,
		title,
		description,
		children,
		action,
		icon,
		dismissible = true,
		defaultState = 'open',
		state = $bindable(defaultState),
		onStateChange,
		onDismiss,
		dismissLabel = 'Dismiss notice',
		dismissedMessage = 'Notice dismissed.',
		...restProps
	}: CollapsibleBannerProps = $props();

	const uid = $props.id();
	const bodyId = `${uid}-body`;
	const titleId = `${uid}-title`;

	const open = $derived(state === 'open');
	const dismissed = $derived(state === 'dismissed');
	const hasBody = $derived(Boolean(description || children || action));

	function commit(next: BannerState) {
		state = next;
		onStateChange?.(next);
	}

	function toggle() {
		commit(open ? 'folded' : 'open');
	}

	function dismiss() {
		commit('dismissed');
		onDismiss?.();
	}

	function onHeaderKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		event.stopPropagation();
		commit('folded');
	}
</script>

{#snippet noticeGlyph()}
	<svg width="16" height="16" viewBox="0 0 256 256" fill="none" aria-hidden="true">
		<circle cx="128" cy="128" r="96" stroke="currentColor" stroke-width="16" />
		<polyline
			points="120 120 128 120 128 176 136 176"
			stroke="currentColor"
			stroke-width="16"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<circle cx="124" cy="84" r="12" fill="currentColor" />
	</svg>
{/snippet}

<div {...restProps}>
	<!-- Dismissal collapses the outer box, so a dismissed banner leaves no gap. -->
	<div
		class="grid rounded-[11px]"
		{@attach motionTo(() => ({
			keyframes: { gridTemplateRows: dismissed ? '0fr' : '1fr' },
			transition: DISCLOSE
		}))}
	>
		<div class="min-h-0 overflow-hidden">
			<div
				role="region"
				aria-labelledby={titleId}
				class={cn(
					'border-border bg-card rounded-[11px] border shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_10px_-8px_rgb(0_0_0/0.45)]',
					className
				)}
				{@attach motionTo(() => ({
					keyframes: { opacity: dismissed ? 0 : 1 },
					transition: { duration: 0.14, ease: EASE }
				}))}
			>
				<div class="flex items-center gap-2.5 p-2.5">
					<span
						aria-hidden="true"
						class="bg-muted text-muted-foreground grid size-[26px] shrink-0 place-items-center rounded-[7px] shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]"
					>
						{#if icon}{@render icon()}{:else}{@render noticeGlyph()}{/if}
					</span>

					{#if hasBody}
						<button
							type="button"
							onclick={toggle}
							onkeydown={onHeaderKeyDown}
							aria-expanded={open}
							aria-controls={bodyId}
							class="group focus-visible:bg-primary/5 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[7px] text-left outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
						>
							<span
								id={titleId}
								class="text-foreground min-w-0 flex-1 truncate text-[13px] leading-5 font-medium"
							>
								{title}
							</span>
							<span
								aria-hidden="true"
								class="text-muted-foreground group-hover:text-foreground flex shrink-0"
								{@attach motionTo(() => ({
									keyframes: { rotate: open ? 180 : 0 },
									transition: NUDGE
								}))}
							>
								<svg width="14" height="14" viewBox="0 0 256 256" fill="none" aria-hidden="true">
									<polyline
										points="208 96 128 176 48 96"
										stroke="currentColor"
										stroke-width="16"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</span>
						</button>
					{:else}
						<span
							id={titleId}
							class="text-foreground min-w-0 flex-1 truncate text-[13px] leading-5 font-medium"
						>
							{title}
						</span>
					{/if}

					{#if dismissible}
						<button
							type="button"
							onclick={dismiss}
							aria-label={dismissLabel}
							class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-primary/5 grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-[7px] transition-colors duration-150 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
						>
							<svg width="13" height="13" viewBox="0 0 256 256" fill="none" aria-hidden="true">
								<line
									x1="200"
									y1="56"
									x2="56"
									y2="200"
									stroke="currentColor"
									stroke-width="16"
									stroke-linecap="round"
								/>
								<line
									x1="200"
									y1="200"
									x2="56"
									y2="56"
									stroke="currentColor"
									stroke-width="16"
									stroke-linecap="round"
								/>
							</svg>
						</button>
					{/if}
				</div>

				{#if hasBody}
					<!--
						Only the body's box changes: the header holds still while the notice
						folds underneath it. Height resolves against the content itself, so a
						description that grows needs no measurement.
					-->
					<div
						id={bodyId}
						inert={!open}
						class="grid"
						{@attach motionTo(() => ({
							keyframes: { gridTemplateRows: open ? '1fr' : '0fr' },
							transition: DISCLOSE
						}))}
					>
						<div class="min-h-0 overflow-hidden">
							<div
								class="pr-2.5 pb-2.5 pl-[46px]"
								{@attach motionTo(() => ({
									keyframes: { y: open ? 0 : -6, opacity: open ? 1 : 0 },
									// Opacity leads on the way out and trails on the way in: text
									// should not appear in a box that has not opened yet.
									transition: {
										...DISCLOSE,
										opacity: { duration: 0.14, ease: EASE, delay: open ? 0.05 : 0 }
									}
								}))}
							>
								{#if description}
									<p class="text-muted-foreground text-[12.5px] leading-relaxed">{description}</p>
								{/if}

								{@render children?.()}

								{#if action}
									<div class="mt-2">{@render action()}</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<span role="status" aria-live="polite" class="sr-only">
		{dismissed ? dismissedMessage : ''}
	</span>
</div>
