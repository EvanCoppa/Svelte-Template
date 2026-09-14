<script lang="ts">
	/**
	 * The wait before the first word arrives: a shimmering label where the
	 * answer will be. A word that reads rather than a pulsing dot, so the
	 * thread always says what is happening.
	 */
	let { text = 'Thinking' }: { text?: string } = $props();
</script>

<span data-slot="assistant-shimmer" class="shimmer text-sm font-medium" role="status">{text}</span>

<style>
	.shimmer {
		display: inline-block;
		margin: 2px 0;
		background: linear-gradient(
			90deg,
			var(--muted-foreground) 25%,
			var(--foreground) 50%,
			var(--muted-foreground) 75%
		);
		background-size: 200% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		color: transparent;
		animation: shimmer 1.6s linear infinite;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.shimmer {
			animation: none;
			background: none;
			-webkit-text-fill-color: currentColor;
			color: var(--muted-foreground);
		}
	}
</style>
