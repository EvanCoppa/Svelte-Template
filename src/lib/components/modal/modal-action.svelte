<script lang="ts">
	import {
		UntitledButton,
		type UntitledButtonProps
	} from '$lib/components/enhanced/untitled-button/index.js';
	import Kbd from './modal-kbd.svelte';

	let {
		type = 'button',
		color = 'primary',
		hint,
		children,
		...restProps
	}: UntitledButtonProps & {
		/**
		 * Shows the `↵` badge. Defaults to on for a submit button, because Enter in
		 * the body's fields submits the surrounding form; off otherwise, since a
		 * plain `onclick` button only fires on Enter while it is focused.
		 */
		hint?: boolean;
	} = $props();

	const showHint = $derived(hint ?? type === 'submit');
	// The badge sits on the button's own fill: translucent on the solid colours,
	// the muted treatment on the outline and text ones.
	const onFill = $derived(color === 'primary' || color === 'primary-destructive');
</script>

<!-- The primary action: `Modal.Action type="submit"` inside the form that wraps the body and footer. -->
<UntitledButton data-slot="modal-action" {type} {color} {children} {...restProps}>
	{#snippet iconTrailing()}
		{#if showHint}
			<Kbd
				class={onFill
					? 'text-primary-foreground border-white/25 bg-white/15'
					: 'bg-background text-muted-foreground'}>↵</Kbd
			>
		{/if}
	{/snippet}
</UntitledButton>
