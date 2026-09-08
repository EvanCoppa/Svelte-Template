<script lang="ts">
	/**
	 * A row's primary column as a link to the record it is about — rendered
	 * through `DataTable.linkCell()`. A plain anchor, so it works before
	 * hydration and a middle-click opens the record in a new tab.
	 */
	let { label, href }: { label: string; href: string } = $props();
</script>

<a {href} data-slot="data-table-link-cell" class="font-medium underline-offset-4 hover:underline">
	{label}
</a>
