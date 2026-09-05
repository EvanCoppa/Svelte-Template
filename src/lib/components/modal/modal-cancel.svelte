<script lang="ts">
	import {
		UntitledButton,
		type UntitledButtonProps
	} from '$lib/components/enhanced/untitled-button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import Kbd from './modal-kbd.svelte';

	let { color = 'tertiary', disabled, children, ...restProps }: UntitledButtonProps = $props();
</script>

<!--
	The dismiss button: `ui/dialog`'s Close wearing the tertiary Untitled skin, with
	the `esc` badge because Escape already closes the dialog. Closing is wired by
	the dialog, so there is no `onclick` to pass — react to `onOpenChange` on
	`Modal.Root` instead.
-->
<Dialog.Close {disabled}>
	{#snippet child({ props })}
		<UntitledButton data-slot="modal-cancel" {color} {children} {...restProps} {...props}>
			{#snippet iconTrailing()}
				<Kbd class="bg-background text-muted-foreground">esc</Kbd>
			{/snippet}
		</UntitledButton>
	{/snippet}
</Dialog.Close>
