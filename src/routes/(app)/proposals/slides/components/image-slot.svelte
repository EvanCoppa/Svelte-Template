<script lang="ts">
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UploadCloudIcon from '@lucide/svelte/icons/upload-cloud';
	import { z } from 'zod';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ImageSlot } from '$lib/slides/registry';

	/**
	 * One image slot — or a video slot, when the registry says `accept:
	 * 'video'`: a drop zone while empty, the picture (or the video's first
	 * frame) with a remove button once filled. The file goes to the upload
	 * endpoint (a `+server.ts`, since the body is a file, not form inputs) and
	 * the URL it answers is what the deck stores.
	 */
	let {
		slot,
		value,
		inputId,
		onchange
	}: { slot: ImageSlot; value: string; inputId: string; onchange: (url: string) => void } =
		$props();

	let uploading = $state(false);
	let error = $state<string | null>(null);

	// What the endpoint answers: the URL on success, SvelteKit's error body otherwise.
	const uploaded = z.object({ url: z.url() });
	const refused = z.object({ message: z.string() });

	const video = $derived(slot.accept === 'video');

	async function upload(file: File) {
		uploading = true;
		error = null;
		try {
			const body = new FormData();
			body.set('file', file);
			const response = await fetch('/api/slides/images', { method: 'POST', body });
			const answer: unknown = await response.json().catch(() => null);
			const ok = uploaded.safeParse(answer);
			if (!response.ok || !ok.success) {
				throw new Error(refused.safeParse(answer).data?.message ?? 'Upload failed.');
			}
			onchange(ok.data.url);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Upload failed.';
		} finally {
			uploading = false;
		}
	}

	function pick(event: Event) {
		const file =
			event.currentTarget instanceof HTMLInputElement ? event.currentTarget.files?.[0] : null;
		if (file) void upload(file);
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) void upload(file);
	}
</script>

<div class="space-y-1.5">
	<label
		for={inputId}
		class="text-[12px] leading-none font-medium text-gray-600 dark:text-gray-300"
	>
		{slot.label}
	</label>
	{#if slot.description}
		<p class="text-[10px] text-gray-400 dark:text-gray-500">{slot.description}</p>
	{/if}

	{#if value}
		<div
			class="group relative aspect-video overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
		>
			{#if video}
				<video src={value} preload="metadata" muted class="h-full w-full object-cover"></video>
			{:else}
				<img src={value} alt="" class="h-full w-full object-cover" />
			{/if}
			<Button
				variant="ghost"
				size="icon"
				class="absolute top-1.5 right-1.5 size-6 bg-black/60 text-white opacity-0 backdrop-blur-sm group-hover:opacity-100 hover:bg-red-500 hover:text-white"
				aria-label={video ? 'Remove video' : 'Remove image'}
				onclick={() => onchange('')}
			>
				<Trash2Icon class="size-3" />
			</Button>
		</div>
	{:else}
		<div
			role="presentation"
			class="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50 dark:hover:border-gray-600"
			ondragover={(event) => event.preventDefault()}
			ondrop={drop}
		>
			<label for={inputId} class="flex cursor-pointer flex-col items-center gap-1.5">
				<input
					id={inputId}
					type="file"
					accept={video ? 'video/*' : 'image/*'}
					class="hidden"
					onchange={pick}
				/>
				{#if uploading}
					<LoaderIcon class="size-5 animate-spin text-blue-500" />
					<span class="text-[11px] font-medium text-blue-600 dark:text-blue-400">Uploading…</span>
				{:else}
					<span
						class="flex size-8 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800"
					>
						<UploadCloudIcon class="size-4 text-gray-400" />
					</span>
					<span class="text-[11px] font-medium text-gray-600 dark:text-gray-300">
						Drop or click to upload
					</span>
				{/if}
			</label>
		</div>
	{/if}

	{#if error}
		<p role="alert" class="px-1 text-[10px] font-medium text-red-500">{error}</p>
	{/if}
</div>
