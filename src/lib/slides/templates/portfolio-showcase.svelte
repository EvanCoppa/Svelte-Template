<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		image1,
		image2,
		eyebrow,
		titleLine1,
		titleLine2,
		cardLabel,
		item1Heading,
		item1Body,
		item2Heading,
		item2Body,
		eyebrowColor,
		titleColor,
		itemHeadingColor,
		bodyColor,
		cardColorStart,
		cardColorEnd,
		circleColor,
		backgroundColor
	} = $derived({
		image1: images.image1,
		image2: images.image2,
		eyebrow: text.eyebrow,
		titleLine1: text.titleLine1,
		titleLine2: text.titleLine2,
		cardLabel: text.cardLabel,
		item1Heading: text.item1Heading,
		item1Body: text.item1Body,
		item2Heading: text.item2Heading,
		item2Body: text.item2Body,
		eyebrowColor: colors.eyebrowColor,
		titleColor: colors.titleColor,
		itemHeadingColor: colors.itemHeadingColor,
		bodyColor: colors.bodyColor,
		cardColorStart: colors.cardColorStart,
		cardColorEnd: colors.cardColorEnd,
		circleColor: colors.circleColor,
		backgroundColor: colors.backgroundColor
	});
</script>

<section class="slide" style={`background: ${backgroundColor}; ${styleVars}`}>
	<!-- Decorative circle bleeding off the right edge -->
	<div class="accent-circle" style={`background: ${circleColor};`}></div>

	<div class="inner">
		<!-- Left: image collage — tall photo, gradient card, second photo -->
		<div class="collage">
			<div class="cell tall" class:placeholder={!image1}>
				{#if image1}
					<img src={image1} alt="" />
				{/if}
			</div>

			<div
				class="cell card"
				style={`background: linear-gradient(135deg, ${cardColorStart} 0%, ${cardColorEnd} 100%);`}
			>
				<span class="card-icon">
					<svg viewBox="0 0 24 24" style={`fill: ${cardColorStart};`}>
						<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" />
					</svg>
				</span>
				<span class="card-label">{cardLabel}</span>
			</div>

			<div class="cell short" class:placeholder={!image2}>
				{#if image2}
					<img src={image2} alt="" />
				{/if}
			</div>
		</div>

		<!-- Right: text column -->
		<div class="text">
			{#if eyebrow}
				<p class="eyebrow" style={`color: ${eyebrowColor};`}>{eyebrow}</p>
			{/if}
			<h1 class="title" style={`color: ${titleColor};`}>
				{#if titleLine1}<span>{titleLine1}</span>{/if}
				{#if titleLine2}<span>{titleLine2}</span>{/if}
			</h1>

			<div class="item">
				<h2 style={`color: ${itemHeadingColor};`}>{item1Heading}</h2>
				{#if item1Body}<p style={`color: ${bodyColor};`}>{item1Body}</p>{/if}
			</div>
			<div class="item">
				<h2 style={`color: ${itemHeadingColor};`}>{item2Heading}</h2>
				{#if item2Body}<p style={`color: ${bodyColor};`}>{item2Body}</p>{/if}
			</div>
		</div>
	</div>
</section>

<style>
	.slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		font-family: Arial, Helvetica, sans-serif;
	}

	.accent-circle {
		position: absolute;
		top: 20%;
		right: -120px;
		width: 240px;
		height: 240px;
		border-radius: 50%;
		z-index: 0;
	}

	.inner {
		position: relative;
		z-index: 1;
		display: flex;
		gap: 60px;
		height: 100%;
		padding: 70px;
		box-sizing: border-box;
		align-items: stretch;
	}

	.collage {
		flex: 0 0 600px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1.1fr 0.9fr;
		gap: 18px;
	}

	.cell {
		position: relative;
		border-radius: 20px;
		overflow: hidden;
	}

	.cell.tall {
		grid-row: 1 / span 2;
	}

	.cell img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.cell.placeholder {
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		color: #ffffff;
	}

	.card-icon {
		width: 84px;
		height: 84px;
		border-radius: 50%;
		background: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.card-icon svg {
		width: 42px;
		height: 42px;
	}

	.card-label {
		font-size: calc(24px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	.text {
		flex: 1;
		align-self: center;
		text-align: var(--text-align, left);
	}

	.eyebrow {
		margin: 0 0 calc(16px * var(--font-scale, 1));
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: 0.01em;
	}

	.title {
		display: flex;
		flex-direction: column;
		margin: 0 0 calc(44px * var(--font-scale, 1));
		font-size: calc(70px * var(--font-scale, 1));
		line-height: var(--line-height, 1.05);
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, -0.02em);
	}

	.item {
		margin-bottom: calc(30px * var(--font-scale, 1));
	}

	.item:last-child {
		margin-bottom: 0;
	}

	.item h2 {
		margin: 0 0 calc(12px * var(--font-scale, 1));
		font-size: calc(27px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
	}

	.item p {
		margin: 0;
		max-width: 480px;
		font-size: calc(19px * var(--font-scale, 1));
		line-height: var(--line-height, 1.6);
		font-weight: 400;
	}
</style>
