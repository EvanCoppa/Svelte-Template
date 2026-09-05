<script lang="ts">
	import {
		UntitledButton,
		type UntitledButtonProps
	} from '$lib/components/enhanced/untitled-button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let { color = 'link-gray', size = 'sm', disabled, ...restProps }: UntitledButtonProps = $props();
</script>

<!--
	The quiet way out under the action — "No thanks", "Maybe later" — closing
	the dialog exactly as Escape does. There is no `onclick` to pass; react to
	`onOpenChange` on `Root` instead.
-->
<Dialog.Close {disabled}>
	{#snippet child({ props })}
		<!-- `data-slot` after the spread: the dialog's own would otherwise win. -->
		<UntitledButton {color} {size} {...restProps} {...props} data-slot="upgrade-modal-dismiss" />
	{/snippet}
</Dialog.Close>
