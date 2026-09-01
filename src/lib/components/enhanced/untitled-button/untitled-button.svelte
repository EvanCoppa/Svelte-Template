<script lang="ts" module>
	import { Button, type ButtonProps } from '$lib/components/ui/button/index.js';
	import { labelSwap, motionPress, motionTo, springs } from '$lib/motion.js';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import { type VariantProps, tv } from 'tailwind-variants';

	/**
	 * The button. Untitled UI's look
	 * (https://www.untitledui.com/react/components/buttons) repainted from this
	 * project's `app.css` tokens, with the motion of Solid Core's interior buttons
	 * underneath: a one-pixel dip under a press, and labels that trade places when
	 * the state changes instead of being swapped.
	 *
	 * What makes the look: a skeuomorphic edge (hairline inset ring + darker bottom
	 * shade + soft drop shadow), a white inner border on filled buttons that fades
	 * away downward, semibold labels, an offset focus outline instead of the shadcn
	 * halo, and leading/trailing icons carried at reduced contrast so the label
	 * stays the loudest thing in the button.
	 *
	 * Two axes, both Untitled UI's: nine `color`s and five `size`s. They are
	 * deliberately named `color`/`size` rather than `variant`/`size` so a call site
	 * never reads like `ui/button` while behaving differently — `sm` here is not
	 * `sm` there.
	 *
	 * It renders `ui/button` with `variant="unstyled"`, so the `<button>`/`<a>`
	 * switch, `ref` binding and disabled handling live in one place. That is the
	 * only place `ui/button` is rendered — every screen reaches for this component.
	 */
	export const untitledButtonVariants = tv({
		base: [
			'relative inline-flex cursor-pointer items-center justify-center whitespace-nowrap font-semibold transition-colors duration-100 ease-linear select-none',
			// An outline set off the edge, rather than a ring hugging it.
			'outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
			// Dimming is for genuinely unavailable buttons — a loading one keeps full
			// contrast so the spinner reads against the fill.
			'disabled:pointer-events-none disabled:not-data-loading:opacity-50',
			'aria-disabled:pointer-events-none aria-disabled:not-data-loading:opacity-50',
			// Icons sit a step back from the label; the spinner and the status marks
			// (anything carrying `data-icon`) do not.
			'[&_svg]:pointer-events-none [&_svg]:shrink-0',
			'[&_svg:not([data-icon])]:opacity-70 hover:[&_svg:not([data-icon])]:opacity-100'
		],
		variants: {
			// Declared before `color` so the link colours' `p-0` wins the merge.
			size: {
				xs: 'gap-1 rounded-lg px-2.5 py-1.5 text-sm before:rounded-[7px] data-icon-only:p-2 [&_svg]:size-4',
				sm: 'gap-1 rounded-lg px-3 py-2 text-sm before:rounded-[7px] data-icon-only:p-2 [&_svg]:size-5',
				md: 'gap-1 rounded-lg px-3.5 py-2.5 text-sm before:rounded-[7px] data-icon-only:p-2.5 [&_svg]:size-5',
				lg: 'gap-1.5 rounded-lg px-4 py-2.5 text-base before:rounded-[7px] data-icon-only:p-3 [&_svg]:size-5',
				xl: 'gap-1.5 rounded-lg px-4.5 py-3 text-base before:rounded-[7px] data-icon-only:p-3.5 [&_svg]:size-5'
			},
			color: {
				primary: [
					'bg-primary text-primary-foreground shadow-skeuomorphic ring-1 ring-transparent ring-inset',
					'hover:bg-primary/90 data-loading:bg-primary/90',
					// Inner border, faded out downward, so only the top edge catches light.
					'before:absolute before:inset-px before:border before:border-white/12 before:[mask-image:linear-gradient(to_bottom,#000,transparent)]'
				],
				secondary: [
					'bg-background text-foreground shadow-skeuomorphic ring-border ring-1 ring-inset',
					'hover:bg-accent hover:text-accent-foreground data-loading:bg-accent'
				],
				tertiary:
					'text-muted-foreground hover:bg-accent hover:text-accent-foreground data-loading:bg-accent',
				'primary-destructive': [
					// `dark:bg-destructive/60` is `ui/button`'s own destructive treatment: the
					// dark token is a light red that white text cannot sit on at full strength.
					'bg-destructive dark:bg-destructive/60 shadow-skeuomorphic outline-destructive text-white ring-1 ring-transparent ring-inset',
					'hover:bg-destructive/90 data-loading:bg-destructive/90',
					'before:absolute before:inset-px before:border before:border-white/12 before:[mask-image:linear-gradient(to_bottom,#000,transparent)]'
				],
				'secondary-destructive': [
					'bg-background text-destructive shadow-skeuomorphic ring-destructive/30 outline-destructive ring-1 ring-inset',
					'hover:bg-destructive/10 data-loading:bg-destructive/10'
				],
				'tertiary-destructive':
					'text-destructive outline-destructive hover:bg-destructive/10 data-loading:bg-destructive/10',
				'link-color': [
					'text-primary justify-normal rounded p-0 hover:text-primary/80 data-icon-only:p-0',
					'[&_[data-text]]:underline [&_[data-text]]:decoration-transparent [&_[data-text]]:underline-offset-4 hover:[&_[data-text]]:decoration-current'
				],
				'link-gray': [
					'text-muted-foreground hover:text-foreground justify-normal rounded p-0 data-icon-only:p-0',
					'[&_[data-text]]:underline [&_[data-text]]:decoration-transparent [&_[data-text]]:underline-offset-4 hover:[&_[data-text]]:decoration-current'
				],
				'link-destructive': [
					'text-destructive outline-destructive hover:text-destructive/80 justify-normal rounded p-0 data-icon-only:p-0',
					'[&_[data-text]]:underline [&_[data-text]]:decoration-transparent [&_[data-text]]:underline-offset-4 hover:[&_[data-text]]:decoration-current'
				]
			}
		},
		defaultVariants: {
			color: 'primary',
			size: 'md'
		}
	});

	export type UntitledButtonColor = NonNullable<
		VariantProps<typeof untitledButtonVariants>['color']
	>;
	export type UntitledButtonSize = NonNullable<VariantProps<typeof untitledButtonVariants>['size']>;
	export type UntitledButtonStatus = 'idle' | 'loading' | 'success' | 'error';

	/** The three colours that render as text rather than as a surface. */
	const LINK_COLORS: readonly UntitledButtonColor[] = [
		'link-color',
		'link-gray',
		'link-destructive'
	];

	/**
	 * Every state's content sits in the same grid cell, so the button is as wide as
	 * its widest label and never resizes mid-request.
	 */
	const LAYER =
		'col-start-1 row-start-1 inline-flex items-center justify-center gap-[inherit] whitespace-nowrap';

	export type UntitledButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'children'> & {
		color?: UntitledButtonColor;
		size?: UntitledButtonSize;
		/**
		 * A pending state the caller owns — a form's `$submitting`. The label gives
		 * way to a spinner and the button stops taking clicks, but keeps focus.
		 */
		loading?: boolean;
		/** Shown beside the spinner in place of the label while loading. */
		loadingLabel?: string;
		/** Keeps the label itself beside the spinner when there is no `loadingLabel`. */
		showTextWhileLoading?: boolean;
		/** Rendered before the label. Pass an icon with no `children` for an icon-only button. */
		iconLeading?: Snippet;
		/** Rendered after the label. */
		iconTrailing?: Snippet;
		children?: Snippet;
	} & (
			| {
					/**
					 * A pending state the button owns — for work triggered from JS with no
					 * form behind it. Runs on click in place of `onclick`; the button shows
					 * its loading state until the returned promise settles, then
					 * `successLabel` or `errorLabel` for `resetAfter` milliseconds. A sync
					 * throw settles into the error state too.
					 */
					onAction: () => void | Promise<void>;
					onclick?: never;
					successLabel?: string;
					errorLabel?: string;
					/** Milliseconds a settled state is held before the label returns to idle. */
					resetAfter?: number;
					/** Receives whatever a failed `onAction` threw or rejected with. */
					onError?: (cause: unknown) => void;
			  }
			| {
					onAction?: undefined;
					successLabel?: never;
					errorLabel?: never;
					resetAfter?: never;
					onError?: never;
			  }
		);
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';

	let {
		class: className,
		color = 'primary',
		size = 'md',
		loading = false,
		loadingLabel,
		showTextWhileLoading = false,
		disabled = false,
		onclick,
		onAction,
		successLabel = 'Done',
		errorLabel = 'Try again',
		resetAfter = 1400,
		onError,
		iconLeading,
		iconTrailing,
		children,
		...restProps
	}: UntitledButtonProps = $props();

	let ownStatus = $state<UntitledButtonStatus>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let runSeq = 0;

	onDestroy(() => {
		runSeq += 1;
		if (timer) clearTimeout(timer);
	});

	function clearTimer() {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	function settle(id: number, next: 'success' | 'error') {
		if (id !== runSeq) return;
		clearTimer();
		ownStatus = next;
		timer = setTimeout(() => {
			if (id === runSeq) ownStatus = 'idle';
		}, resetAfter);
	}

	function run() {
		if (!onAction || status === 'loading') return;
		clearTimer();
		const id = ++runSeq;
		ownStatus = 'loading';

		Promise.resolve()
			.then(() => onAction())
			.then(
				() => settle(id, 'success'),
				(cause: unknown) => {
					onError?.(cause);
					settle(id, 'error');
				}
			);
	}

	/** A click that lands while loading must not submit the form or follow the link. */
	function swallow(event: Event) {
		event.preventDefault();
	}

	const status = $derived<UntitledButtonStatus>(loading ? 'loading' : ownStatus);
	const inert = $derived(disabled || status === 'loading');
	const isLink = $derived(LINK_COLORS.includes(color));
	const iconOnly = $derived(!children && Boolean(iconLeading || iconTrailing));
	// The idle layer stays in the accessibility tree while the visible layer has no
	// text of its own (a bare spinner), so the button keeps its name.
	const idleExposed = $derived(
		status === 'idle' ||
			(status === 'loading' && !loadingLabel && !(showTextWhileLoading && children))
	);
</script>

<Button
	variant="unstyled"
	data-slot="untitled-button"
	data-status={status}
	data-loading={status === 'loading' ? '' : undefined}
	data-icon-only={iconOnly ? '' : undefined}
	aria-busy={status === 'loading' || undefined}
	aria-disabled={inert || undefined}
	{disabled}
	onclick={status === 'loading' ? swallow : onAction ? run : onclick}
	class={cn(untitledButtonVariants({ color, size }), className)}
	{@attach inert ? undefined : motionPress({ y: 1 }, { y: 0 }, springs.snap)}
	{...restProps}
>
	<span class="relative grid">
		<span
			aria-hidden={!idleExposed || undefined}
			class={cn(LAYER, status !== 'idle' && 'opacity-0')}
			{@attach motionTo(() => ({ keyframes: labelSwap(status === 'idle') }))}
		>
			{@render iconLeading?.()}
			{#if children}
				<!-- The label is its own element so the link colours can underline it without
				     dragging the icons into the underline. -->
				<span data-text class={cn(!isLink && 'px-0.5')}>{@render children()}</span>
			{/if}
			{@render iconTrailing?.()}
		</span>

		<span
			aria-hidden={status !== 'loading' || undefined}
			class={cn(LAYER, status !== 'loading' && 'opacity-0')}
			{@attach motionTo(() => ({ keyframes: labelSwap(status === 'loading') }))}
		>
			<svg data-icon="loading" viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<circle class="stroke-current opacity-30" cx="10" cy="10" r="8" stroke-width="2" />
				<circle
					class="origin-center animate-spin stroke-current"
					cx="10"
					cy="10"
					r="8"
					stroke-width="2"
					stroke-dasharray="12.5 50"
					stroke-linecap="round"
				/>
			</svg>
			{#if loadingLabel}
				<span data-text class={cn(!isLink && 'px-0.5')}>{loadingLabel}</span>
			{:else if showTextWhileLoading && children}
				<span data-text class={cn(!isLink && 'px-0.5')}>{@render children()}</span>
			{/if}
		</span>

		{#if onAction}
			<span
				aria-hidden={status !== 'success' || undefined}
				class={cn(LAYER, status !== 'success' && 'opacity-0')}
				{@attach motionTo(() => ({ keyframes: labelSwap(status === 'success') }))}
			>
				<svg data-icon="success" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<path
						d="M4.5 10.5 8.3 14.3 15.5 6.5"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span data-text class={cn(!isLink && 'px-0.5')}>{successLabel}</span>
			</span>

			<span
				aria-hidden={status !== 'error' || undefined}
				class={cn(LAYER, status !== 'error' && 'opacity-0')}
				{@attach motionTo(() => ({ keyframes: labelSwap(status === 'error') }))}
			>
				<svg data-icon="error" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<path d="M10 5v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					<path d="M10 14.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
				</svg>
				<span data-text class={cn(!isLink && 'px-0.5')}>{errorLabel}</span>
			</span>
		{/if}
	</span>
</Button>

{#if onAction}
	<span role="status" aria-live="polite" class="sr-only">
		{status === 'success' ? successLabel : status === 'error' ? errorLabel : ''}
	</span>
{/if}
