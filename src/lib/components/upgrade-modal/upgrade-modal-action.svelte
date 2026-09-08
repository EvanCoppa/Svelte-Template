<script lang="ts">
	import {
		UntitledButton,
		type UntitledButtonProps
	} from '$lib/components/enhanced/untitled-button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		class: className,
		color = 'primary',
		size = 'md',
		...restProps
	}: UntitledButtonProps = $props();
</script>

<!--
	The one call to action, full width in the primary Untitled skin. `href` for
	a link (billing, a mailto), `onclick` or `type="submit"` for an action.
-->
<UntitledButton
	data-slot="upgrade-modal-action"
	{color}
	{size}
	class={cn('w-full', className)}
	{...restProps}
/>
