<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { motionTo } from '$lib/motion.js';

	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	/** The face crossfading in once it has decoded. */
	const FADE = { duration: 0.24, ease: EASE };

	interface PresenceTileProps {
		name: string;
		src?: string;
		/** Tile edge in pixels. Font size is derived from it. */
		size: number;
	}

	let { name, src, size }: PresenceTileProps = $props();

	type FaceStatus = 'loading' | 'ready' | 'error';

	let status = $state<FaceStatus>('loading');
	/** A cached photo is already there — fading it in would be a lie. */
	let instant = $state(false);

	const label = $derived(initials(name));

	function initials(value: string): string {
		const words = value.trim().split(/\s+/).filter(Boolean);
		if (words.length === 0) return '?';
		const first = Array.from(words[0])[0] ?? '';
		const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
		return (first + last).toUpperCase();
	}

	const face: Attachment<HTMLImageElement> = (img) => {
		// Read `src` so a swapped photo re-runs the attachment.
		if (!src) {
			status = 'loading';
			instant = false;
			return;
		}

		if (img.complete) {
			const ok = img.naturalWidth > 0;
			status = ok ? 'ready' : 'error';
			instant = ok;
			return;
		}

		status = 'loading';
		instant = false;

		const onLoad = () => {
			status = 'ready';
		};
		const onError = () => {
			status = 'error';
		};

		img.addEventListener('load', onLoad);
		img.addEventListener('error', onError);

		return () => {
			img.removeEventListener('load', onLoad);
			img.removeEventListener('error', onError);
		};
	};
</script>

<!--
	Two shells: the outer one is the hairline given real thickness, so the rim
	around a face is a single colour rather than a border with a lighter band
	trapped inside it.
-->
<span
	class="bg-border block size-full rounded-[10px] p-[3px] select-none"
	style:font-size={`${Math.round(size * 0.34)}px`}
>
	<span
		class="bg-muted text-muted-foreground relative grid size-full place-items-center overflow-hidden rounded-[7px] leading-none font-medium"
	>
		{label}

		{#if src}
			<img
				{@attach face}
				{src}
				alt=""
				width={size}
				height={size}
				decoding="async"
				class="absolute inset-0 size-full object-cover"
				{@attach motionTo(() => ({
					keyframes: { opacity: status === 'ready' ? 1 : 0 },
					transition: instant ? { duration: 0 } : FADE
				}))}
			/>
		{/if}
	</span>
</span>
