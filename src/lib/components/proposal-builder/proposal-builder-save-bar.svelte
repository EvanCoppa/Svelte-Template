<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * The two blue save buttons, and the one bar they become while the save
	 * runs: the gap closes, both go grey, their inner corners square off, the
	 * labels fade and one spinner sits over the pair. Both submit the form
	 * around them; the page decides the destination from which was pressed.
	 */
	let {
		submitting,
		primaryLabel,
		secondaryLabel,
		onPrimary,
		onSecondary
	}: {
		submitting: boolean;
		primaryLabel: string;
		secondaryLabel: string;
		onPrimary: () => void;
		onSecondary: () => void;
	} = $props();

	const button =
		'text-primary-foreground h-auto flex-1 px-6 py-3 font-medium shadow-sm transition-all duration-300 hover:shadow-md focus:ring-0 focus:outline-none disabled:cursor-not-allowed';
</script>

<div
	data-slot="proposal-builder-save-bar"
	class="relative mt-2 flex flex-col transition-all duration-300 sm:flex-row {submitting
		? 'gap-0'
		: 'gap-3'}"
>
	<Button
		type="submit"
		disabled={submitting}
		onclick={onPrimary}
		class="{button} {submitting
			? 'bg-muted-foreground border-0 sm:rounded-r-none'
			: 'bg-primary hover:bg-primary/90 rounded-sm'}"
	>
		<span class="transition-opacity duration-300" style:opacity={submitting ? 0 : 1}>
			{primaryLabel}
		</span>
	</Button>
	<Button
		type="submit"
		disabled={submitting}
		onclick={onSecondary}
		class="{button} {submitting
			? 'bg-muted-foreground border-0 sm:rounded-l-none'
			: 'bg-primary hover:bg-primary/90 rounded-sm'}"
	>
		<span class="transition-opacity duration-300" style:opacity={submitting ? 0 : 1}>
			{secondaryLabel}
		</span>
	</Button>

	{#if submitting}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2">
			<LoaderCircleIcon class="text-background h-5 w-5 animate-spin" />
			<span class="text-background font-medium">Submitting...</span>
		</div>
	{/if}
</div>
