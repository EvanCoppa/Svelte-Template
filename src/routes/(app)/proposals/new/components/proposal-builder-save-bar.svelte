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
		'h-auto flex-1 px-6 py-3 font-medium text-white shadow-sm transition-all duration-300 hover:shadow-md focus:ring-0 focus:outline-none disabled:cursor-not-allowed';
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
			? 'border-0 bg-gray-400 sm:rounded-r-none'
			: 'rounded-sm bg-blue-600 hover:bg-blue-700'}"
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
			? 'border-0 bg-gray-400 sm:rounded-l-none'
			: 'rounded-sm bg-blue-600 hover:bg-blue-700'}"
	>
		<span class="transition-opacity duration-300" style:opacity={submitting ? 0 : 1}>
			{secondaryLabel}
		</span>
	</Button>

	{#if submitting}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2">
			<LoaderCircleIcon class="h-5 w-5 animate-spin text-white" />
			<span class="font-medium text-white">Submitting...</span>
		</div>
	{/if}
</div>
