<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();

	/**
	 * `field-sizing: content` below is what grows the box with what is typed —
	 * and Firefox does not implement it, where the field would otherwise stay
	 * one row tall and scroll inside itself. This measures the content and sets
	 * the height only where that CSS is missing, so every browser grows the
	 * same way while the ones that support it still do so without JavaScript.
	 *
	 * `max-height` still caps the result, so a field with one goes on scrolling
	 * past its limit rather than growing without end.
	 */
	$effect(() => {
		const el = ref;
		// Read inside the effect so a keystroke re-measures.
		void value;
		if (!el || CSS.supports('field-sizing', 'content')) return;
		// The height has to collapse before `scrollHeight` is read: left at what
		// it was, it never reports a content box that has got smaller.
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	});
</script>

<textarea
	bind:this={ref}
	data-slot="textarea"
	class={cn(
		'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
		className
	)}
	bind:value
	spellcheck="true"
	{...restProps}></textarea>
