<script lang="ts">
	import { SLIDE_THEME } from '../theme';
	import type { SlideProps } from '../types';

	let { text, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		patientName,
		lineItems,
		discountPercent,
		discountLabel,
		insuranceEstimate,
		insuranceLabel,
		financingMonths,
		financingApr,
		totalLabel,
		footnote,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		heading: text.heading,
		patientName: text.patientName,
		lineItems: text.lineItems,
		discountPercent: text.discountPercent,
		discountLabel: text.discountLabel,
		insuranceEstimate: text.insuranceEstimate,
		insuranceLabel: text.insuranceLabel,
		financingMonths: text.financingMonths,
		financingApr: text.financingApr,
		totalLabel: text.totalLabel,
		footnote: text.footnote,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	/** Tolerant number parse: "$4,500.00" -> 4500. Anything unparseable is 0. */
	function toNumber(raw: string | undefined): number {
		if (!raw) return 0;
		const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
		return Number.isFinite(n) ? n : 0;
	}

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	let items = $derived(
		lineItems
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [label, amount] = line.split('|').map((s) => s.trim());
				return { label: label ?? '', amount: toNumber(amount) };
			})
	);

	let subtotal = $derived(items.reduce((sum, item) => sum + item.amount, 0));
	let discountRate = $derived(Math.max(0, Math.min(100, toNumber(discountPercent))));
	let discountAmount = $derived(Math.round((subtotal * discountRate) / 100));
	let insurance = $derived(Math.max(0, toNumber(insuranceEstimate)));
	/** Never let courtesies and coverage push the balance below zero. */
	let total = $derived(Math.max(0, subtotal - discountAmount - insurance));

	let months = $derived(Math.max(0, Math.floor(toNumber(financingMonths))));
	let apr = $derived(Math.max(0, toNumber(financingApr)));

	/**
	 * Standard amortized payment. At 0% APR this degenerates to an even split,
	 * which is the common "interest-free in-house plan" case, so that branch is
	 * handled explicitly rather than dividing by a zero rate.
	 */
	let monthlyPayment = $derived.by(() => {
		if (months <= 0 || total <= 0) return 0;
		if (apr <= 0) return total / months;
		const r = apr / 100 / 12;
		return (total * r) / (1 - Math.pow(1 + r, -months));
	});
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if patientName}
				<p class="who" style="color: {accentColor};">Prepared for {patientName}</p>
			{/if}
		</div>

		<div class="body">
			<div class="items">
				{#each items as item, i (i)}
					<div class="row">
						<span class="label" style="color: {textColor};">{item.label}</span>
						<span class="dots" aria-hidden="true"></span>
						<span class="amount" style="color: {headingColor};">
							{currency.format(item.amount)}
						</span>
					</div>
				{/each}

				<div class="row sum">
					<span class="label" style="color: {headingColor};">Subtotal</span>
					<span class="dots" aria-hidden="true"></span>
					<span class="amount" style="color: {headingColor};">
						{currency.format(subtotal)}
					</span>
				</div>

				{#if discountAmount > 0}
					<div class="row credit">
						<span class="label" style="color: {accentColor};">
							{discountLabel} ({discountRate}%)
						</span>
						<span class="dots" aria-hidden="true"></span>
						<span class="amount" style="color: {accentColor};">
							−{currency.format(discountAmount)}
						</span>
					</div>
				{/if}

				{#if insurance > 0}
					<div class="row credit">
						<span class="label" style="color: {accentColor};">{insuranceLabel}</span>
						<span class="dots" aria-hidden="true"></span>
						<span class="amount" style="color: {accentColor};">
							−{currency.format(insurance)}
						</span>
					</div>
				{/if}
			</div>

			<aside
				class="totals"
				style="background: linear-gradient(155deg, {headingColor}, {SLIDE_THEME.navy});"
			>
				<div class="total-block">
					<div class="total-label">{totalLabel}</div>
					<div class="total-value">{currency.format(total)}</div>
				</div>

				{#if monthlyPayment > 0}
					<div class="divider"></div>
					<div class="monthly">
						<div class="monthly-label">or as low as</div>
						<div class="monthly-value" style="color: {accentColor};">
							{currency.format(monthlyPayment)}<span class="per">/mo</span>
						</div>
						<div class="monthly-terms">
							{months} monthly payments · {apr > 0 ? `${apr}% APR` : '0% interest'}
						</div>
					</div>
				{/if}
			</aside>
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
		padding: calc(60px * var(--padding-scale, 1)) calc(80px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 40px;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	h2 {
		font-size: calc(52px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, left);
		margin: 0;
	}

	.who {
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.02em;
		text-align: var(--text-align, left);
		margin: 0;
	}

	.body {
		display: grid;
		grid-template-columns: 1fr 420px;
		gap: 56px;
		align-items: start;
	}

	.items {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding-top: 6px;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 14px;
		font-size: calc(24px * var(--font-scale, 1));
		line-height: var(--line-height, 1.35);
	}

	.label {
		font-weight: var(--font-weight, 500);
		letter-spacing: var(--letter-spacing, normal);
	}

	/* Leader dots keep long item names visually tied to their amount. */
	.dots {
		flex: 1;
		border-bottom: 2px dotted #cbd5e1;
		transform: translateY(-6px);
	}

	.amount {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.row.sum {
		margin-top: 10px;
		padding-top: 20px;
		border-top: 2px solid #e2e8f0;
		font-size: calc(26px * var(--font-scale, 1));
	}

	.row.sum .label,
	.row.sum .amount {
		font-weight: 700;
	}

	.row.credit .label,
	.row.credit .amount {
		font-weight: 600;
	}

	.totals {
		border-radius: 24px;
		padding: 40px 38px;
		color: #ffffff;
		display: flex;
		flex-direction: column;
		gap: 26px;
		box-shadow: 0 24px 50px -28px rgba(15, 23, 42, 0.55);
	}

	.total-label {
		font-size: calc(17px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.72;
	}

	.total-value {
		font-size: calc(66px * var(--font-scale, 1));
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
		margin-top: 8px;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.18);
	}

	.monthly-label {
		font-size: calc(18px * var(--font-scale, 1));
		opacity: 0.72;
	}

	.monthly-value {
		font-size: calc(46px * var(--font-scale, 1));
		font-weight: 800;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
		margin-top: 4px;
	}

	.per {
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: 600;
		margin-left: 4px;
	}

	.monthly-terms {
		font-size: calc(16px * var(--font-scale, 1));
		opacity: 0.66;
		margin-top: 8px;
	}

	.footnote {
		font-size: calc(16px * var(--font-scale, 1));
		line-height: 1.5;
		margin: 0;
		opacity: 0.7;
		max-width: 820px;
	}
</style>
