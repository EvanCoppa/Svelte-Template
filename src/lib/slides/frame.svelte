<script lang="ts">
	import { type ShownSlide, slideProps } from './present';
	import { SLIDE_HEIGHT, SLIDE_WIDTH } from './theme';
	import type { Presentation } from './types';

	/**
	 * One slide drawn at its real 1400×850 and scaled down to fill whatever
	 * width it is given — the thumbnail in the list, the card in the picker,
	 * the canvas in the middle and the big preview in the modal are all this,
	 * at different widths.
	 */
	let { shown, presentation }: { shown: ShownSlide; presentation: Presentation } = $props();

	let scale = $state(0);

	function fit(node: HTMLElement) {
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width ?? 0;
			if (width > 0) scale = width / SLIDE_WIDTH;
		});
		observer.observe(node);
		return () => observer.disconnect();
	}

	const slide = $derived(slideProps(shown, presentation));
</script>

<div
	class="relative w-full overflow-hidden bg-white"
	style="aspect-ratio: {SLIDE_WIDTH} / {SLIDE_HEIGHT};"
	{@attach fit}
>
	<div
		class="pointer-events-none absolute inset-0 origin-top-left"
		style="transform: scale({scale}); width: {SLIDE_WIDTH}px; height: {SLIDE_HEIGHT}px;"
	>
		<shown.template.Component {...slide} />
	</div>
</div>
