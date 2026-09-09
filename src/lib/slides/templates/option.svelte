<script lang="ts">
	import { money } from '../present';
	import { SLIDE_THEME } from '../theme';
	import type { SlideProps } from '../types';

	let { text, colors, styleVars, presentation, option }: SlideProps = $props();

	// The presenter always hands this template an option; the registry marks
	// it per-option. The builder previews it over the sample's first option.
	const shown = $derived(option ?? presentation.options[0] ?? null);
	const index = $derived(shown ? presentation.options.findIndex((o) => o.id === shown.id) + 1 : 0);
</script>

<section
	class="slide"
	style="background: {colors.backgroundColor}; color: {colors.textColor}; {styleVars}"
>
	{#if shown}
		<header>
			<div>
				<p class="eyebrow" style="color: {colors.accentColor};">
					{text.eyebrow} · {index} of {presentation.options.length}
				</p>
				<h2 style="color: {colors.headingColor};">{shown.label}</h2>
			</div>
			{#if shown.recommended}
				<span class="badge" style="background: {colors.accentColor};">{text.recommendedLabel}</span>
			{/if}
		</header>

		<div class="body">
			<table>
				<tbody>
					{#each shown.lines as line, i (i)}
						<tr>
							<td class="name">
								{line.label}
								{#if line.detail}<span class="detail">{line.detail}</span>{/if}
							</td>
							<td class="qty">{line.quantity} × {money(line.unitCost, shown.currency)}</td>
							<td class="amount">{money(line.total, shown.currency)}</td>
						</tr>
					{:else}
						<tr><td class="name muted" colspan="3">No itemised lines.</td></tr>
					{/each}
				</tbody>
			</table>

			<aside
				class="totals"
				style="background: linear-gradient(155deg, {colors.headingColor}, {SLIDE_THEME.navy});"
			>
				<span class="total-label">Total</span>
				<span class="total">{money(shown.total, shown.currency)}</span>
				{#if shown.duration}
					<div class="fact"><span>Duration</span><strong>{shown.duration}</strong></div>
				{/if}
				{#if shown.financing}
					<div class="fact"><span>Financing</span><strong>{shown.financing}</strong></div>
				{/if}
				{#each shown.fields as field (field.label)}
					<div class="fact"><span>{field.label}</span><strong>{field.value}</strong></div>
				{/each}
			</aside>
		</div>

		{#if text.footnote}
			<p class="footnote">{text.footnote}</p>
		{/if}
	{:else}
		<p class="empty">This slide repeats once per option; the proposal has none.</p>
	{/if}
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
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
	}
	.eyebrow {
		margin: 0 0 10px;
		font-size: calc(17px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0;
		font-size: calc(56px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		line-height: 1.05;
	}
	.badge {
		color: #fff;
		padding: 10px 20px;
		border-radius: 999px;
		font-size: 16px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.body {
		display: grid;
		grid-template-columns: 1fr 400px;
		gap: 48px;
		flex: 1;
		min-height: 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: calc(22px * var(--font-scale, 1));
		line-height: var(--line-height, 1.3);
		align-self: start;
	}
	td {
		padding: 16px 8px;
		border-bottom: 1px solid #e8edf3;
		vertical-align: top;
	}
	.name {
		font-weight: 500;
	}
	.detail {
		display: block;
		font-size: 0.75em;
		opacity: 0.7;
	}
	.qty {
		white-space: nowrap;
		opacity: 0.7;
		font-size: 0.85em;
		text-align: right;
	}
	.amount {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		white-space: nowrap;
	}
	.muted {
		opacity: 0.6;
	}
	.totals {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 36px 34px;
		border-radius: 24px;
		color: #fff;
		box-shadow: 0 24px 50px -28px rgba(15, 23, 42, 0.55);
		align-self: start;
	}
	.total-label {
		font-size: 15px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.8;
	}
	.total {
		font-size: calc(58px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		padding-bottom: 18px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.18);
	}
	.fact {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		font-size: 18px;
	}
	.fact span {
		opacity: 0.75;
	}
	.footnote {
		margin: 0;
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
