<script lang="ts">
	/**
	 * The wait before the first word arrives: a shimmering label where the
	 * answer will be. A word that reads rather than a pulsing dot, so the
	 * thread always says what is happening.
	 *
	 * The shimmer itself is `.shimmer-text` in `src/app.css`, shared with the
	 * thinking block, which wears the same treatment on its own label while it
	 * works — one way for a surface to say it is busy.
	 */
	let { text = 'Thinking' }: { text?: string } = $props();
</script>

<span
	data-slot="assistant-shimmer"
	class="shimmer-text my-[2px] inline-block text-sm font-medium"
	role="status">{text}</span
>
