<script lang="ts">
	import PaletteIcon from '@lucide/svelte/icons/palette';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { BADGE_TONES, type BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
	import { noteDash } from '$lib/notes';
	import { capitalize, cn } from '$lib/utils.js';

	/**
	 * What color the paper is. The ten tones the app already owns — the same
	 * vocabulary as every status pill and tag — so a note can never be a color
	 * nothing else in the app is.
	 */
	let {
		value,
		onpick
	}: {
		value: BadgeTone;
		onpick: (color: BadgeTone) => void;
	} = $props();

	let open = $state(false);

	function pick(color: BadgeTone) {
		open = false;
		if (color !== value) onpick(color);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" class="size-7" title="Color">
				<PaletteIcon class="size-4" />
				<span class="sr-only">Change color</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-2">
		<div class="grid grid-cols-5 gap-1.5" data-slot="note-palette">
			{#each BADGE_TONES as tone (tone)}
				<button
					type="button"
					onclick={() => pick(tone)}
					aria-label={capitalize(tone)}
					aria-pressed={tone === value}
					class={cn(
						'focus-visible:ring-ring size-6 rounded-full transition-transform outline-none hover:scale-110 focus-visible:ring-2',
						noteDash(tone),
						tone === value && 'ring-foreground ring-2 ring-offset-2'
					)}
				></button>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
