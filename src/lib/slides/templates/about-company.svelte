<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		body,
		image,
		card1Title,
		card1Body,
		card2Title,
		card2Body,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		heading: text.heading,
		body: text.body,
		image: images.image,
		card1Title: text.card1Title,
		card1Body: text.card1Body,
		card2Title: text.card2Title,
		card2Body: text.card2Body,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<!-- Decorative: thin circle ripples, lower-left -->
	<svg
		class="decor-lines"
		viewBox="0 0 1400 850"
		preserveAspectRatio="xMidYMid slice"
		aria-hidden="true"
	>
		<circle
			cx="-20"
			cy="430"
			r="260"
			fill="none"
			stroke={accentColor}
			stroke-opacity="0.35"
			stroke-width="1.5"
		/>
		<circle
			cx="10"
			cy="480"
			r="345"
			fill="none"
			stroke={accentColor}
			stroke-opacity="0.2"
			stroke-width="1.5"
		/>
	</svg>

	<!-- Decorative: filled blob, top-right corner -->
	<svg
		class="decor-blob"
		viewBox="0 0 1400 850"
		preserveAspectRatio="xMidYMid slice"
		aria-hidden="true"
	>
		<defs>
			<linearGradient id="ac-blob-grad" x1="0" y1="1" x2="1" y2="0">
				<stop offset="0" stop-color="color-mix(in srgb, {accentColor} 45%, white 55%)" />
				<stop offset="1" stop-color="color-mix(in srgb, {accentColor} 85%, #13324e 15%)" />
			</linearGradient>
		</defs>
		<path
			d="M 1400 0 L 690 0 C 800 40 760 150 880 195 C 1000 240 940 330 1075 350 C 1195 368 1230 250 1400 300 Z"
			fill="url(#ac-blob-grad)"
		/>
	</svg>

	<!-- Left: heading + body -->
	<div class="left-copy">
		<h2 style="color: {headingColor};">{heading}</h2>
		<p style="color: {textColor};">{body}</p>
	</div>

	<!-- Right: framed photo -->
	<div class="photo-frame">
		{#if image}
			<img src={image} alt="" />
		{:else}
			<div class="placeholder">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="52"
					height="52"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle
						cx="8.5"
						cy="8.5"
						r="1.5"
					/><polyline points="21 15 16 10 5 21" /></svg
				>
			</div>
		{/if}
	</div>

	<!-- Bottom: two info cards -->
	<div class="cards">
		<div class="card">
			<h3 style="color: {headingColor};">{card1Title}</h3>
			<p style="color: {textColor};">{card1Body}</p>
		</div>
		<div class="card">
			<h3 style="color: {headingColor};">{card2Title}</h3>
			<p style="color: {textColor};">{card2Body}</p>
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
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
	}

	.decor-lines,
	.decor-blob {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.left-copy {
		position: absolute;
		left: 170px;
		top: 132px;
		width: 400px;
		z-index: 2;
		text-align: var(--text-align, left);
	}

	.left-copy h2 {
		margin: 0 0 24px;
		font-size: calc(48px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: 1.15;
		letter-spacing: var(--letter-spacing, -0.01em);
		white-space: pre-line;
	}

	.left-copy p {
		margin: 0;
		max-width: 380px;
		font-size: calc(15px * var(--font-scale, 1));
		line-height: var(--line-height, 1.7);
		font-weight: var(--font-weight, 400);
	}

	.photo-frame {
		position: absolute;
		left: 610px;
		top: 96px;
		width: 626px;
		height: 396px;
		background: #ffffff;
		border-radius: 38px 38px 96px 38px;
		padding: 8px;
		box-shadow: 0 24px 60px -20px rgba(15, 23, 42, 0.35);
		z-index: 1;
	}

	.photo-frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 32px 32px 88px 32px;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		border-radius: 32px 32px 88px 32px;
		background: linear-gradient(160deg, #e2e6ea 0%, #cfd4d9 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #9aa3ac;
	}

	.cards {
		position: absolute;
		left: 170px;
		right: 170px;
		top: 545px;
		display: flex;
		gap: 40px;
		z-index: 2;
	}

	.card {
		flex: 1;
		background: #ffffff;
		border-radius: 22px;
		padding: 28px 30px;
		box-shadow: 0 18px 40px -18px rgba(15, 23, 42, 0.18);
	}

	.card h3 {
		margin: 0 0 10px;
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: 700;
	}

	.card p {
		margin: 0;
		font-size: calc(14px * var(--font-scale, 1));
		line-height: var(--line-height, 1.6);
		font-weight: var(--font-weight, 400);
	}
</style>
