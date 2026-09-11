<script lang="ts">
	import { StatusBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import type { PreviewStatus } from '$lib/schemas/imports';

	/** How a previewed row will land, as a pill — one tone and one word per status, the same in the summary and the table. */
	let { status }: { status: PreviewStatus } = $props();

	const TONES = {
		new: 'success',
		match: 'info',
		invalid: 'error',
		duplicate: 'warning'
	} satisfies Record<PreviewStatus, BadgeTone>;

	const LABELS = {
		new: 'New',
		match: 'Exists',
		invalid: 'Invalid',
		duplicate: 'Duplicate'
	} satisfies Record<PreviewStatus, string>;
</script>

<StatusBadge tone={TONES[status]}>{LABELS[status]}</StatusBadge>
