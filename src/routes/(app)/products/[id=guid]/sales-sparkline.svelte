<script lang="ts">
	/**
	 * Revenue per day over the sales window, as one thin line on a filled
	 * area — a sparkline for the rail, not a chart page. One series, so it
	 * needs no legend (the section title names it) and wears the primary
	 * token; the hover layer names the day under the pointer, because an
	 * unlabelled line is a shape, not a figure.
	 */
	let {
		series,
		currency
	}: {
		series: readonly { day: Date; revenue: number }[];
		currency: string;
	} = $props();

	const WIDTH = 280;
	const HEIGHT = 72;
	const PAD = 4;

	const money = $derived(
		new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })
	);
	const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

	const max = $derived(Math.max(1, ...series.map((point) => point.revenue)));
	const step = $derived(series.length > 1 ? (WIDTH - 2 * PAD) / (series.length - 1) : 0);
	const x = (index: number) => PAD + index * step;
	const y = (revenue: number) => HEIGHT - PAD - (revenue / max) * (HEIGHT - 2 * PAD);

	const points = $derived(series.map((point, index) => `${x(index)},${y(point.revenue)}`));
	const line = $derived(points.join(' '));
	const area = $derived(
		series.length > 0
			? `${x(0)},${HEIGHT - PAD} ${line} ${x(series.length - 1)},${HEIGHT - PAD}`
			: ''
	);

	/** The point under the pointer, by index. */
	let hover = $state<number | null>(null);
	let svg = $state<SVGSVGElement | null>(null);

	function track(event: PointerEvent) {
		if (!svg || series.length === 0 || step === 0) return;
		const rect = svg.getBoundingClientRect();
		const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
		hover = Math.min(series.length - 1, Math.max(0, Math.round((px - PAD) / step)));
	}

	const hovered = $derived(hover === null ? null : series[hover]);
	const first = $derived(series[0]);
	const last = $derived(series[series.length - 1]);
</script>

<div data-slot="sales-sparkline" class="space-y-1">
	<p class="text-muted-foreground h-4 text-xs tabular-nums" aria-live="polite">
		{#if hovered}
			{dayLabel.format(hovered.day)} · {money.format(hovered.revenue)}
		{/if}
	</p>
	<svg
		bind:this={svg}
		viewBox="0 0 {WIDTH} {HEIGHT}"
		class="text-primary block h-18 w-full touch-none"
		role="img"
		aria-label="Revenue per day over the window"
		onpointermove={track}
		onpointerleave={() => (hover = null)}
	>
		{#if series.length > 1}
			<polygon points={area} fill="currentColor" fill-opacity="0.12" />
			<polyline
				points={line}
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
			/>
		{/if}
		{#if hovered && hover !== null}
			<line
				x1={x(hover)}
				x2={x(hover)}
				y1={PAD}
				y2={HEIGHT - PAD}
				stroke="currentColor"
				stroke-opacity="0.3"
				stroke-dasharray="2 3"
				vector-effect="non-scaling-stroke"
			/>
			<circle
				cx={x(hover)}
				cy={y(hovered.revenue)}
				r="4"
				fill="currentColor"
				stroke="var(--color-card)"
				stroke-width="2"
				vector-effect="non-scaling-stroke"
			/>
		{/if}
	</svg>
	{#if first && last}
		<div class="text-muted-foreground flex justify-between text-[11px]">
			<span>{dayLabel.format(first.day)}</span>
			<span>{dayLabel.format(last.day)}</span>
		</div>
	{/if}
</div>
