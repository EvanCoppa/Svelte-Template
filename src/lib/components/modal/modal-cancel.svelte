<script lang="ts">
	import {
		UntitledButton,
		type UntitledButtonProps
	} from '$lib/components/enhanced/untitled-button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { cn } from '$lib/utils.js';
	import Kbd from './modal-kbd.svelte';

	let {
		class: className,
		color = 'tertiary',
		disabled,
		children,
		...restProps
	}: UntitledButtonProps = $props();
</script>

<!--
	The dismiss button: `ui/dialog`'s Close wearing the tertiary Untitled skin, with
	the `esc` badge because Escape already closes the dialog. Closing is wired by
	the dialog, so there is no `onclick` to pass — react to `onOpenChange` on
	`Modal.Root` instead. The negative start margin lines the label up with the
	body's content edge, the way a text button in a footer is expected to sit.
-->
<Dialog.Close {disabled}>
	{#snippet child({ props })}
		<UntitledButton
			data-slot="modal-cancel"
			{color}
			{children}
			class={cn('-ms-3.5', className)}
			{...restProps}
			{...props}
		>
			{#snippet iconTrailing()}
				<Kbd class="bg-background text-muted-foreground">esc</Kbd>
			{/snippet}
		</UntitledButton>
	{/snippet}
</Dialog.Close>
