<script lang="ts">
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { cn } from '$lib/utils.js';

	/**
	 * Where the file lands: a real `<input type="file">` dressed as a drop
	 * target, so the keyboard, the file picker and a drag all reach the same
	 * input and the form posts it as any file input would. Dragging only
	 * sets the input's files — the page still submits.
	 */
	let {
		id,
		name,
		accept,
		files = $bindable(),
		invalid = false,
		disabled = false,
		description
	}: {
		id: string;
		name: string;
		/** The `accept` attribute — extensions, since browsers disagree on CSV's MIME type. */
		accept: string;
		files?: FileList;
		invalid?: boolean;
		disabled?: boolean;
		/** The line under the prompt: what the file needs to contain. */
		description: string;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);

	const chosen = $derived(files?.[0] ?? null);

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (disabled || !input || !event.dataTransfer) return;
		input.files = event.dataTransfer.files;
		files = input.files;
	}
</script>

<!-- The label IS the target: a click opens the picker, and the input inside it
     takes focus for the keyboard. -->
<label
	for={id}
	data-slot="import-drop-zone"
	data-dragging={dragging ? '' : undefined}
	class={cn(
		'bg-muted/40 text-muted-foreground flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
		'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-[3px]',
		dragging && 'border-primary bg-primary/5',
		invalid && 'border-destructive',
		disabled && 'cursor-not-allowed opacity-60'
	)}
	ondragover={(event) => {
		event.preventDefault();
		if (!disabled) dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={drop}
>
	<span
		class="bg-background flex size-14 items-center justify-center rounded-full border shadow-xs"
		aria-hidden="true"
	>
		{#if chosen}
			<FileSpreadsheetIcon class="text-foreground size-6" />
		{:else}
			<UploadIcon class="size-6" />
		{/if}
	</span>
	{#if chosen}
		<span class="text-foreground text-base font-semibold">{chosen.name}</span>
		<span class="text-sm">
			{Math.max(1, Math.round(chosen.size / 1024))} KB · drop another file to replace it
		</span>
	{:else}
		<span class="text-foreground text-base font-semibold">
			Drag a spreadsheet here, or click to browse
		</span>
		<span class="text-sm">{description}</span>
	{/if}
	<input
		bind:this={input}
		{id}
		{name}
		type="file"
		{accept}
		{disabled}
		bind:files
		aria-invalid={invalid ? 'true' : undefined}
		class="sr-only"
	/>
</label>
