<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, colors, styleVars }: SlideProps = $props();
	const {
		eyebrow,
		heading,
		subheading,
		steps,
		footnote,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		eyebrow: text.eyebrow,
		heading: text.heading,
		subheading: text.subheading,
		steps: text.steps,
		footnote: text.footnote,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	let parsedSteps = $derived(
		steps
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [title, description] = line.split('|').map((s) => s.trim());
				return { title: title ?? '', description: description ?? '' };
			})
	);
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			{#if eyebrow}
				<div class="eyebrow" style="color: {accentColor};">{eyebrow}</div>
			{/if}
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if subheading}
				<p class="sub" style="color: {textColor};">{subheading}</p>
			{/if}
		</div>

		<div class="cards">
			{#each parsedSteps as step, i (i)}
				<div class="card-slot" style="animation-delay: {0.1 + i * 0.14}s;">
					<div class="card" style="border-color: color-mix(in srgb, {accentColor} 20%, #e7ecf3);">
						<div class="chip" style="background: {accentColor};">
							{String(i + 1).padStart(2, '0')}
						</div>
						<h3 style="color: {headingColor};">{step.title}</h3>
						{#if step.description}
							<p style="color: {textColor};">{step.description}</p>
						{/if}
					</div>

					{#if i < parsedSteps.length - 1}
						<div class="arrow" style="color: color-mix(in srgb, {accentColor} 55%, #cbd5e1);">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M5 12h14" />
								<path d="m12 5 7 7-7 7" />
							</svg>
						</div>
					{/if}
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
		padding: calc(64px * var(--padding-scale, 1)) calc(72px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 56px;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}

	.eyebrow {
		font-size: calc(18px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h2 {
		font-size: calc(54px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, center);
		margin: 0;
	}

	.sub {
		font-size: calc(23px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.45);
		text-align: var(--text-align, center);
		margin: 0;
		max-width: 900px;
	}

	.cards {
		display: flex;
		align-items: stretch;
		justify-content: center;
		gap: 0;
	}

	.card-slot {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0;
		animation: card-rise 0.55s ease-out backwards;
	}

	.card {
		flex: 1;
		align-self: stretch;
		border: 2px solid #e7ecf3;
		border-radius: 22px;
		padding: 34px 30px 32px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		background: #ffffff;
		box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.5);
	}

	.chip {
		align-self: flex-start;
		color: #ffffff;
		font-size: calc(20px * var(--font-scale, 1));
		font-weight: 800;
		letter-spacing: 0.04em;
		padding: 8px 16px;
		border-radius: 12px;
		line-height: 1;
	}

	h3 {
		font-size: calc(27px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		line-height: 1.2;
		letter-spacing: var(--letter-spacing, normal);
		margin: 6px 0 0 0;
	}

	p {
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.5);
		letter-spacing: var(--letter-spacing, normal);
		margin: 0;
	}

	.arrow {
		flex-shrink: 0;
		width: 56px;
		display: flex;
		justify-content: center;
	}

	.arrow svg {
		width: 32px;
		height: 32px;
	}

	.footnote {
		font-size: calc(18px * var(--font-scale, 1));
		text-align: center;
		margin: 0;
		opacity: 0.72;
	}

	@keyframes card-rise {
		from {
			opacity: 0;
			transform: translateY(22px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media print {
		.card-slot {
			animation: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card-slot {
			animation: none;
		}
	}
</style>
