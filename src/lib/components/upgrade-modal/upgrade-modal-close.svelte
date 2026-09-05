<script lang="ts">
	import {
		UntitledButton,
		type UntitledButtonProps
	} from '$lib/components/enhanced/untitled-button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { cn } from '$lib/utils.js';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		class: className,
		...restProps
	}: Omit<UntitledButtonProps, 'color' | 'size' | 'children' | 'iconLeading' | 'iconTrailing'> =
		$props();
</script>

<!--
	The X pinned over the hero: `ui/dialog`'s Close wearing the tertiary Untitled
	skin, as on `Modal.Card`. Place it last inside `Content` so the pitch's own
	buttons come first in the tab order.
-->
<Dialog.Close>
	{#snippet child({ props })}
		<UntitledButton
			color="tertiary"
			size="xs"
			aria-label="Close"
			class={cn('absolute end-3 top-3', className)}
			{...restProps}
			{...props}
			data-slot="upgrade-modal-close"
		>
			{#snippet iconLeading()}<XIcon />{/snippet}
		</UntitledButton>
	{/snippet}
</Dialog.Close>
