<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		subheading,
		plans,
		featuredPlan,
		featuredLabel,
		footnote,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		heading: text.heading,
		subheading: text.subheading,
		plans: text.plans,
		featuredPlan: text.featuredPlan,
		featuredLabel: text.featuredLabel,
		footnote: text.footnote,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	interface Plan {
		name: string;
		eligibility: string;
		monthly: string;
		yearly: string;
		savings: string;
		benefits: string[];
	}

	/**
	 * Formats a bare number as "$1,284" so editors can type either "1284" or
	 * an already-formatted string like "$1,284/quarter", which passes through.
	 */
	function money(value: string): string {
		if (!value) return '';
		if (!/^[\d.,]+$/.test(value)) return value;
		const num = Number(value.replace(/,/g, ''));
		if (!isFinite(num)) return `$${value}`;
		return `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
	}

	const parsedPlans = $derived<Plan[]>(
		plans
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [name, eligibility, monthly, yearly, savings, benefits] = line
					.split('|')
					.map((s) => s.trim());
				return {
					name: name ?? '',
					eligibility: eligibility ?? '',
					monthly: money(monthly ?? ''),
					yearly: money(yearly ?? ''),
					savings: money(savings ?? ''),
					benefits: (benefits ?? '')
						.split(';')
						.map((b) => b.trim())
						.filter(Boolean)
				};
			})
			.slice(0, 4)
	);

	const featuredIndex = $derived(Number(featuredPlan) - 1);
</script>

<section class="slide" style="background: {backgroundColor}; color: {textColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if subheading}
				<p class="sub">{subheading}</p>
			{/if}
		</div>

		<div class="cards" data-count={parsedPlans.length}>
			{#each parsedPlans as plan, i (i)}
				{@const featured = i === featuredIndex}
				<div
					class="card"
					class:featured
					style="border-color: {featured ? accentColor : '#e5e7eb'};"
				>
					{#if featured && featuredLabel}
						<div class="ribbon" style="background: {accentColor};">
							{featuredLabel}
						</div>
					{/if}

					<div class="card-head" style="color: {headingColor};">
						<div class="plan-name">{plan.name}</div>
						{#if plan.eligibility}
							<div class="eligibility">{plan.eligibility}</div>
						{/if}
					</div>

					{#if plan.monthly}
						<div class="price" style="color: {accentColor};">
							<span class="amount">{plan.monthly}</span>
							<span class="per">/mo</span>
						</div>
					{/if}

					{#if plan.yearly || plan.savings}
						<div class="terms">
							{#if plan.yearly}
								<div class="yearly">
									{plan.yearly} paid yearly
								</div>
							{/if}
							{#if plan.savings}
								<div class="savings" style="color: {accentColor}; border-color: {accentColor};">
									Save {plan.savings}
								</div>
							{/if}
						</div>
					{/if}

					{#if plan.benefits.length}
						<ul class="benefits">
							{#each plan.benefits as benefit (benefit)}
								<li>
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke={accentColor}
										stroke-width="3"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M20 6 9 17l-5-5" />
									</svg>
									<span>{benefit}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>

		{#if footnote}
			<p class="footnote">{footnote}</p>
		{/if}
	</div>
</section>

<style>
	.slide {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: var(--content-justify, center);
		justify-content: center;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		padding: calc(56px * var(--padding-scale, 1)) calc(72px * var(--padding-scale, 1));
		box-sizing: border-box;
	}

	.wrap {
		width: 100%;
		max-width: 1240px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.head {
		text-align: var(--text-align, center);
	}

	h2 {
		margin: 0;
		font-size: calc(52px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: var(--line-height, 1.15);
		letter-spacing: var(--letter-spacing, -0.01em);
	}

	.sub {
		margin: 10px 0 0 0;
		font-size: calc(22px * var(--font-scale, 1));
		opacity: 0.75;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
		gap: 20px;
		align-items: stretch;
	}

	.cards[data-count='2'] {
		--cols: 2;
		max-width: 760px;
		margin: 0 auto;
	}
	.cards[data-count='3'] {
		--cols: 3;
	}
	.cards[data-count='4'] {
		--cols: 4;
		gap: 14px;
	}

	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 26px 22px;
		border: 2px solid #e5e7eb;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.75);
		text-align: center;
	}

	.card.featured {
		border-width: 3px;
		box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
		transform: translateY(-6px);
	}

	.ribbon {
		position: absolute;
		top: -13px;
		left: 50%;
		transform: translateX(-50%);
		color: #fff;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 5px 14px;
		border-radius: 999px;
		white-space: nowrap;
	}

	.plan-name {
		font-size: calc(28px * var(--font-scale, 1));
		font-weight: 800;
		letter-spacing: 0.02em;
	}

	.eligibility {
		margin-top: 2px;
		font-size: 13px;
		font-weight: 600;
		opacity: 0.6;
	}

	.price {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 4px;
	}

	.amount {
		font-size: calc(58px * var(--font-scale, 1));
		font-weight: 900;
		line-height: 1;
	}

	.per {
		font-size: 16px;
		font-weight: 700;
	}

	.terms {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.yearly {
		font-size: 14px;
		font-weight: 600;
		opacity: 0.8;
	}

	.savings {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border: 1.5px solid;
		border-radius: 999px;
		padding: 3px 12px;
	}

	.benefits {
		list-style: none;
		margin: 4px 0 0 0;
		padding: 14px 0 0 0;
		border-top: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		gap: 8px;
		text-align: left;
	}

	.benefits li {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: calc(17px * var(--font-scale, 1));
		line-height: 1.35;
	}

	.benefits svg {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		margin-top: 3px;
	}

	.footnote {
		margin: 0;
		text-align: center;
		font-size: 13px;
		opacity: 0.6;
		line-height: 1.5;
	}
</style>
