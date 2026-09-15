<script lang="ts">
	import type { NavIcon } from '$lib/features/icons';

	/**
	 * A feature's icon in the registry directory: the component the slug
	 * resolves to, with the slug itself as its label — an operator reading
	 * this table is checking that `features.icon` names something the app
	 * actually ships.
	 */
	let { icon: Icon, slug }: { icon: NavIcon; slug: string | null } = $props();
</script>

<span class="flex items-center gap-2">
	<Icon class="size-4 shrink-0" />
	<span class="text-muted-foreground text-xs">{slug ?? '—'}</span>
</span>
