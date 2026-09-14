<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { href, label }: { href: string; label: string } = $props();
</script>

<!--
	The way back to the list. The breadcrumb trail is the way back on a wide
	screen; this is the way back everywhere else.
-->
<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button {...props} {href} variant="ghost" size="icon" class="mt-0.5" data-slot="detail-back">
				<ArrowLeftIcon />
				<span class="sr-only">{label}</span>
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
