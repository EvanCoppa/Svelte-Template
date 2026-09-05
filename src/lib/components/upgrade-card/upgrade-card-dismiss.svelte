<script lang="ts">
	import {
		UntitledButton,
		type UntitledButtonProps
	} from '$lib/components/enhanced/untitled-button/index.js';

	let { color = 'link-gray', size = 'sm', ...restProps }: UntitledButtonProps = $props();
</script>

<!-- The quiet way out under the action: "No thanks", "Maybe later". -->
<UntitledButton data-slot="upgrade-card-dismiss" {color} {size} {...restProps} />
