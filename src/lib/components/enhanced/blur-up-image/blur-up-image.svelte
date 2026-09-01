<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionEnter, motionTo, reducedMotion } from '$lib/motion.js';

	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	/** The develop: the full image sharpens, desaturates back and settles. */
	const DEVELOP = { duration: 0.65, ease: EASE };
	const INSTANT = { duration: 0 } as const;

	export type BlurUpStatus = 'loading' | 'ready' | 'error';

	export interface BlurUpImageProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children' | 'color'
	> {
		src?: string;
		alt: string;
		/** Intrinsic width; with `height` it reserves the box as an aspect ratio. */
		width: number;
		/** Intrinsic height; with `width` it reserves the box as an aspect ratio. */
		height: number;
		/** Tiny inline placeholder (LQIP data URI) shown blurred until the photo decodes. */
		placeholder?: string;
		/** Average color painted behind everything while bytes arrive. */
		color?: string;
		/** Blur radius applied to the static placeholder, in pixels. */
		blur?: number;
		radius?: 5 | 6 | 9 | 11 | 14;
		srcSet?: string;
		sizes?: string;
		loading?: 'lazy' | 'eager';
		fetchPriority?: 'high' | 'low' | 'auto';
		onReady?: () => void;
		onError?: () => void;
	}

	let {
		class: className,
		src,
		alt,
		width,
		height,
		placeholder,
		color,
		blur = 14,
		radius = 11,
		srcSet,
		sizes,
		loading = 'lazy',
		fetchPriority,
		onReady,
		onError,
		...restProps
	}: BlurUpImageProps = $props();

	let status = $state<BlurUpStatus>('loading');
	let instant = $state(false);

	const shown = $derived(status === 'ready');
	const still = $derived(reducedMotion.current || instant);

	const watch: Attachment<HTMLImageElement> = (img) => {
		// Re-run whenever the source changes.
		void src;
		void srcSet;

		const set = (nextStatus: BlurUpStatus, nextInstant: boolean) => {
			status = nextStatus;
			instant = nextInstant;
		};

		if (!src) {
			set('loading', false);
			return;
		}

		let alive = true;

		// A cached image is detected before any event fires and revealed with a
		// zero-duration transition, so it never flashes its own placeholder.
		const cached = img.complete && img.naturalWidth > 0;

		const reveal = () => {
			if (!alive) return;
			set('ready', cached);
			onReady?.();
		};

		const fail = () => {
			if (!alive) return;
			set('error', cached);
			onError?.();
		};

		if (img.complete) {
			if (cached) reveal();
			else fail();
			return () => {
				alive = false;
			};
		}

		set('loading', false);

		const handleLoad = () => {
			if (!alive) return;
			// Wait on decode(), not the load event: load only promises the bytes
			// arrived, and swapping there can drop the frame the swap happens on.
			const decoding = img.decode?.();
			if (decoding) {
				decoding.then(reveal, fail);
				return;
			}
			reveal();
		};

		img.addEventListener('load', handleLoad);
		img.addEventListener('error', fail);

		return () => {
			alive = false;
			img.removeEventListener('load', handleLoad);
			img.removeEventListener('error', fail);
		};
	};
</script>

<div
	{...restProps}
	aria-busy={status === 'loading'}
	data-slot="blur-up-image"
	style:aspect-ratio="{width} / {height}"
	style:border-radius="{radius}px"
	style:background-color={color}
	class={cn('bg-muted relative w-full overflow-hidden', className)}
>
	{#if placeholder}
		<img
			src={placeholder}
			alt=""
			aria-hidden="true"
			draggable={false}
			class="absolute inset-0 h-full w-full object-cover"
			style:filter="blur({blur}px)"
			style:transform="scale(1.08)"
		/>
	{/if}

	<img
		{@attach watch}
		{src}
		srcset={srcSet}
		{sizes}
		{alt}
		{width}
		{height}
		{loading}
		fetchpriority={fetchPriority}
		decoding="async"
		draggable={false}
		class="absolute inset-0 h-full w-full object-cover"
		{@attach motionTo(
			() => ({
				keyframes: still
					? { opacity: shown ? 1 : 0 }
					: shown
						? { opacity: 1, filter: 'blur(0px) saturate(1)', scale: 1 }
						: { opacity: 0, filter: 'blur(18px) saturate(0.6)', scale: 1.06 },
				transition: still ? INSTANT : DEVELOP
			}),
			{ initial: true }
		)}
	/>

	{#if status === 'error'}
		<div
			aria-hidden="true"
			class="bg-card text-muted-foreground absolute inset-0 grid place-items-center"
			{@attach motionEnter({ opacity: [0, 1] }, still ? INSTANT : DEVELOP)}
		>
			<svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
				<path
					d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16h64a8,8,0,0,0,7.59-5.47l14.83-44.48L163,151.43a8.07,8.07,0,0,0,4.46-4.46l14.62-36.55,44.48-14.83A8,8,0,0,0,232,88V56A16,16,0,0,0,216,40ZM112.41,157.47,98.23,200H40V172l52-52,30.42,30.42L117,152.57A8,8,0,0,0,112.41,157.47ZM216,82.23,173.47,96.41a8,8,0,0,0-4.9,4.62l-14.72,36.82L138.58,144l-35.27-35.27a16,16,0,0,0-22.62,0L40,149.37V56H216Zm12.68,33a8,8,0,0,0-7.21-1.1l-23.8,7.94a8,8,0,0,0-4.9,4.61l-14.31,35.77-35.77,14.31a8,8,0,0,0-4.61,4.9l-7.94,23.8A8,8,0,0,0,137.73,216H216a16,16,0,0,0,16-16V121.73A8,8,0,0,0,228.68,115.24ZM216,200H148.83l3.25-9.75,35.51-14.2a8.07,8.07,0,0,0,4.46-4.46l14.2-35.51,9.75-3.25Z"
				/>
			</svg>
		</div>
	{/if}
</div>
