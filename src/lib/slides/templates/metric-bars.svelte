<script lang="ts">
	import { SLIDE_THEME } from '../theme';
	import type { SlideProps } from '../types';

	let { text, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		subheading,
		rows,
		footnote,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		heading: text.heading,
		subheading: text.subheading,
		rows: text.rows,
		footnote: text.footnote,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	function toNumber(raw: string | undefined): number | null {
		if (!raw) return null;
		const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
		return Number.isFinite(n) ? n : null;
	}

	let parsed = $derived(
		rows
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [label, value, max, suffix] = line.split('|').map((s) => s.trim());
				return {
					label: label ?? '',
					value: toNumber(value) ?? 0,
					max: toNumber(max),
					suffix: suffix ?? ''
				};
			})
	);

	/** Shared scale for rows that don't declare their own ceiling. */
	let autoMax = $derived(parsed.reduce((peak, row) => Math.max(peak, row.value), 0) || 1);

	let bars = $derived(
		parsed.map((row) => {
			const ceiling = row.max && row.max > 0 ? row.max : autoMax;
			return {
				...row,
				percent: Math.max(0, Math.min(100, (row.value / ceiling) * 100))
			};
		})
	);

	/** Trim the trailing ".0" that plain division leaves on whole numbers. */
	function formatValue(value: number): string {
		return Number.isInteger(value) ? String(value) : value.toFixed(1);
	}
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if subheading}
				<p class="sub" style="color: {textColor};">{subheading}</p>
			{/if}
		</div>

		<div class="bars">
			{#each bars as bar, i (i)}
				<div class="row">
					<div class="row-head">
						<span class="label" style="color: {headingColor};">{bar.label}</span>
						<span class="value" style="color: {accentColor};">
							{formatValue(bar.value)}{bar.suffix}
						</span>
					</div>
					<div class="track" style="background: color-mix(in srgb, {accentColor} 12%, #eef2f7);">
						<div
							class="fill"
							style="width: {bar.percent}%;
                                   background: linear-gradient(90deg, {accentColor}, {SLIDE_THEME.accentBright});
                                   animation-delay: {0.1 + i * 0.12}s;"
						></div>
					</div>
				</div>
			{/each}
		</div>

		{#if footnote}
			<p class="footnote" style="color: {textColor};">{footnote}</p>
		{/if}
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		display: flex;
		align-items: var(--content-justify, center);
	}

	.wrap {
		width: 100%;
		padding: calc(64px * var(--padding-scale, 1)) calc(96px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 52px;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	h2 {
		font-size: calc(52px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, left);
		margin: 0;
	}

	.sub {
		font-size: calc(23px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.45);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		margin: 0;
		max-width: 940px;
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: 34px;
	}

	.row-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 12px;
	}

	.label {
		font-size: calc(25px * var(--font-scale, 1));
		font-weight: var(--font-weight, 600);
		letter-spacing: var(--letter-spacing, normal);
	}

	.value {
		font-size: calc(30px * var(--font-scale, 1));
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.track {
		height: 22px;
		border-radius: 999px;
		overflow: hidden;
	}

	/*
     * The bar grows from zero on entry. No "backwards" fill mode: the resting
     * state is the full width, so print and static captures show real values.
     */
	.fill {
		height: 100%;
		border-radius: 999px;
		animation: bar-grow 0.9s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.footnote {
		font-size: calc(17px * var(--font-scale, 1));
		margin: 0;
		opacity: 0.7;
	}

	@keyframes bar-grow {
		from {
			width: 0;
		}
	}

	@media print {
		.fill {
			animation: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			animation: none;
		}
	}
</style>
