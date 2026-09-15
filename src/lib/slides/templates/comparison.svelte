<script lang="ts">
	import { money } from '../present';
	import type { SlideProps } from '../types';

	let { text, colors, styleVars, presentation }: SlideProps = $props();

	const options = $derived(presentation.options);

	// The rows every option has, then the org's own comparison rows in the
	// order the first option lists them (all options carry the same set).
	const rows = $derived.by(() => {
		const built: { label: string; cells: string[] }[] = [
			{ label: 'Total', cells: options.map((o) => money(o.total, o.currency)) }
		];
		if (options.some((o) => o.duration)) {
			built.push({ label: 'Duration', cells: options.map((o) => o.duration ?? '—') });
		}
		if (options.some((o) => o.financing)) {
			built.push({ label: 'Financing', cells: options.map((o) => o.financing ?? '—') });
		}
		const labels = options[0]?.fields.map((field) => field.label) ?? [];
		for (const label of labels) {
			built.push({
				label,
				cells: options.map((o) => o.fields.find((field) => field.label === label)?.value ?? '—')
			});
		}
		return built;
	});
</script>

<section
	class="slide"
	style="background: {colors.backgroundColor}; color: {colors.textColor}; --accent: {colors.accentColor}; {styleVars}"
>
	<header>
		<h2 style="color: {colors.headingColor};">{text.heading}</h2>
		{#if text.subheading}<p class="sub">{text.subheading}</p>{/if}
	</header>

	{#if options.length > 0}
		<div class="grid" style="grid-template-columns: 1.4fr repeat({options.length}, 1fr);">
			<div class="cell head"></div>
			{#each options as option (option.id)}
				<div class="cell head col" class:pick={option.recommended}>
					{#if option.recommended}
						<span class="pill" style="background: {colors.accentColor};"
							>{text.recommendedLabel}</span
						>
					{/if}
					<span class="col-label" style="color: {colors.headingColor};">{option.label}</span>
				</div>
			{/each}
			{#each rows as row, r (row.label)}
				<div class="cell label" class:last={r === rows.length - 1}>{row.label}</div>
				{#each row.cells as cell, c (c)}
					<div
						class="cell"
						class:pick={options[c]?.recommended}
						class:last={r === rows.length - 1}
						class:strong={r === 0}
					>
						{cell}
					</div>
				{/each}
			{/each}
		</div>
	{:else}
		<p class="empty">The proposal has no options to compare.</p>
	{/if}

	{#if text.footnote}<p class="footnote">{text.footnote}</p>{/if}
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: 36px;
		padding: calc(64px * var(--padding-scale, 1)) calc(80px * var(--padding-scale, 1));
		box-sizing: border-box;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	h2 {
		margin: 0 0 10px;
		font-size: calc(54px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		line-height: 1.05;
	}
	.sub {
		margin: 0;
		font-size: calc(24px * var(--font-scale, 1));
		opacity: 0.8;
		line-height: var(--line-height, 1.4);
	}
	.grid {
		display: grid;
		font-size: calc(22px * var(--font-scale, 1));
	}
	.cell {
		padding: 20px 18px;
		border-bottom: 1px solid #e8edf3;
		text-align: center;
	}
	.cell.head {
		border-bottom: 2px solid #dbe3ec;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding-top: 12px;
	}
	.cell.label {
		text-align: left;
		padding-left: 8px;
		font-weight: 500;
	}
	.cell.strong {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.cell.pick {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}
	.cell.head.pick {
		border-radius: 16px 16px 0 0;
	}
	.cell.pick.last {
		border-radius: 0 0 16px 16px;
		border-bottom: none;
	}
	.col-label {
		font-size: 1.15em;
		font-weight: 700;
	}
	.pill {
		color: #fff;
		padding: 6px 14px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.footnote {
		margin: auto 0 0;
		font-size: calc(16px * var(--font-scale, 1));
		opacity: 0.7;
		white-space: pre-line;
	}
	.empty {
		margin: auto;
		font-size: 24px;
		opacity: 0.6;
	}
</style>
