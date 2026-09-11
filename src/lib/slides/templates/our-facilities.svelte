<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		body,
		imageLarge,
		imageSmall,
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
		imageLarge: images.imageLarge,
		imageSmall: images.imageSmall,
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

<section class="slide" style="background: {backgroundColor}; --accent: {accentColor}; {styleVars}">
	<!-- Decorative background -->
	<svg class="decor" viewBox="0 0 1400 850" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		<defs>
			<linearGradient id="of-blob" x1="0.1" y1="0.1" x2="0.9" y2="1">
				<stop offset="0" stop-color="color-mix(in srgb, {accentColor} 40%, white 60%)" />
				<stop offset="1" stop-color="color-mix(in srgb, {accentColor} 78%, white 22%)" />
			</linearGradient>
		</defs>
		<!-- pale rounded blob behind top-right photo -->
		<path
			d="M 1400 90 C 1250 90 1210 210 1255 300 C 1300 388 1400 360 1400 360 Z"
			fill={accentColor}
			fill-opacity="0.14"
		/>
		<!-- large blue blob, bottom-right -->
		<path
			d="M 1400 330 C 1245 345 1180 470 1225 590 C 1262 690 1130 770 940 800 C 900 806 1400 850 1400 850 Z"
			fill="url(#of-blob)"
		/>
		<!-- thin flowing line, left edge -->
		<path
			d="M 70 150 C 40 300 150 360 130 480 C 115 570 200 610 260 690"
			fill="none"
			stroke={accentColor}
			stroke-width="1.5"
			stroke-opacity="0.5"
		/>
	</svg>

	<!-- Heading + body -->
	<div class="intro">
		<h2 style="color: {headingColor};">{heading}</h2>
		<p style="color: {textColor};">{body}</p>
	</div>

	<!-- Large photo (top center-right) -->
	<div class="frame frame-large">
		{#if imageLarge}
			<img src={imageLarge} alt="" />
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

	<!-- Small photo (lower-left) -->
	<div class="frame frame-small">
		{#if imageSmall}
			<img src={imageSmall} alt="" />
		{:else}
			<div class="placeholder">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="44"
					height="44"
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

	<!-- Two info cards -->
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

	.decor {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.intro {
		position: absolute;
		left: 172px;
		top: 150px;
		width: 400px;
		z-index: 2;
		text-align: var(--text-align, left);
	}

	.intro h2 {
		margin: 0 0 22px;
		font-size: calc(60px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: 1.05;
		letter-spacing: var(--letter-spacing, -0.02em);
	}

	.intro p {
		margin: 0;
		max-width: 330px;
		font-size: calc(15px * var(--font-scale, 1));
		line-height: var(--line-height, 1.7);
		font-weight: var(--font-weight, 400);
	}

	.frame {
		position: absolute;
		background: #ffffff;
		padding: 10px;
		border-radius: 26px;
		box-shadow:
			0 22px 55px -20px color-mix(in srgb, var(--accent) 55%, transparent),
			0 8px 24px -12px rgba(15, 23, 42, 0.16);
		z-index: 1;
	}

	.frame img,
	.frame .placeholder {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 18px;
		display: block;
	}

	.placeholder {
		background: linear-gradient(160deg, #e2e6ea 0%, #cfd4d9 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #9aa3ac;
	}

	.frame-large {
		left: 598px;
		top: 104px;
		width: 650px;
		height: 358px;
	}

	.frame-small {
		left: 174px;
		top: 428px;
		width: 380px;
		height: 232px;
	}

	.cards {
		position: absolute;
		left: 598px;
		top: 496px;
		display: flex;
		gap: 26px;
		z-index: 2;
	}

	.card {
		width: 288px;
		background: #ffffff;
		border-radius: 20px;
		padding: 30px 32px;
		box-shadow: 0 18px 42px -18px rgba(15, 23, 42, 0.18);
	}

	.card h3 {
		margin: 0 0 14px;
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: 700;
	}

	.card p {
		margin: 0;
		font-size: calc(14px * var(--font-scale, 1));
		line-height: var(--line-height, 1.65);
		font-weight: var(--font-weight, 400);
	}
</style>
