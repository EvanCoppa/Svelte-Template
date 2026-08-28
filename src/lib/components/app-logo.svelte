<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();
</script>

<!-- Placeholder brand mark — swap for your product's logo. -->
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class={className}>
	<rect x="2" y="2" width="20" height="20" rx="6" fill="var(--color-primary)" />
	<path
		d="M8 15.5 12 8l4 7.5"
		stroke="white"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
