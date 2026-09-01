<script lang="ts" module>
	import { Button, type ButtonProps } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import { type VariantProps, tv } from 'tailwind-variants';

	/**
	 * The Untitled UI button skin (https://www.untitledui.com/react/components/buttons),
	 * repainted from this project's `app.css` tokens.
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
	 */
	export const untitledButtonVariants = tv({
		base: [
			'relative inline-flex cursor-pointer items-center justify-center whitespace-nowrap font-semibold transition duration-100 ease-linear select-none',
			// An outline set off the edge, rather than a ring hugging it.
			'outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
			// Dimming is for genuinely unavailable buttons — a loading one keeps full
			// contrast so the spinner reads against the fill.
			'disabled:pointer-events-none disabled:not-data-loading:opacity-50',
			'aria-disabled:pointer-events-none aria-disabled:not-data-loading:opacity-50',
			// Icons sit a step back from the label; the spinner inherits it instead.
			'[&_svg]:pointer-events-none [&_svg]:shrink-0',
			'[&>svg:not([data-icon=loading])]:opacity-70 hover:[&>svg:not([data-icon=loading])]:opacity-100'
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

	/** The three colours that render as text rather than as a surface. */
	const LINK_COLORS: readonly UntitledButtonColor[] = [
		'link-color',
		'link-gray',
		'link-destructive'
	];

	export type UntitledButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'children'> & {
		color?: UntitledButtonColor;
		size?: UntitledButtonSize;
		/** Swaps the content for a spinner and makes the button inert. */
		loading?: boolean;
		/** Keeps the label beside the spinner instead of replacing it. */
		showTextWhileLoading?: boolean;
		/** Rendered before the label. Pass an icon with no `children` for an icon-only button. */
		iconLeading?: Snippet;
		/** Rendered after the label. */
		iconTrailing?: Snippet;
		children?: Snippet;
	};
</script>

<script lang="ts">
	let {
		class: className,
		color = 'primary',
		size = 'md',
		loading = false,
		showTextWhileLoading = false,
		disabled = false,
		iconLeading,
		iconTrailing,
		children,
		...restProps
	}: UntitledButtonProps = $props();

	const isLink = $derived(LINK_COLORS.includes(color));
	const iconOnly = $derived(!children && Boolean(iconLeading || iconTrailing));
</script>

<Button
	variant="unstyled"
	data-slot="untitled-button"
	data-loading={loading ? '' : undefined}
	data-icon-only={iconOnly ? '' : undefined}
	aria-busy={loading || undefined}
	disabled={disabled || loading}
	class={cn(
		untitledButtonVariants({ color, size }),
		// While loading, everything but the spinner steps aside — reserving its space
		// so the button does not resize mid-request.
		loading &&
			(showTextWhileLoading
				? '[&>*:not([data-icon=loading]):not([data-text])]:hidden'
				: '[&>*:not([data-icon=loading])]:invisible'),
		className
	)}
	{...restProps}
>
	{@render iconLeading?.()}

	{#if loading}
		<svg
			data-icon="loading"
			viewBox="0 0 20 20"
			fill="none"
			aria-hidden="true"
			class={cn(
				!showTextWhileLoading && 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
			)}
		>
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
	{/if}

	{#if children}
		<!-- The label is its own element so the link colours can underline it without
		     dragging the icons into the underline. -->
		<span data-text class={cn(!isLink && 'px-0.5')}>{@render children()}</span>
	{/if}

	{@render iconTrailing?.()}
</Button>
