<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const { heading, body, image, backgroundColor, headingColor, textColor, accentColor } = $derived({
		heading: text.heading,
		body: text.body,
		image: images.image,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<!-- Decorative background: soft blobs + flowing line -->
	<svg class="decor" viewBox="0 0 1400 850" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		<defs>
			<linearGradient id="wc-blob" x1="0" y1="1" x2="0.35" y2="0">
				<stop offset="0" stop-color={accentColor} stop-opacity="0.55" />
				<stop offset="1" stop-color={accentColor} stop-opacity="0.05" />
			</linearGradient>
			<linearGradient id="wc-blob-2" x1="0" y1="1" x2="0.2" y2="0.1">
				<stop offset="0" stop-color={accentColor} stop-opacity="0.32" />
				<stop offset="1" stop-color={accentColor} stop-opacity="0" />
			</linearGradient>
		</defs>

		<!-- Lower-left organic blob wrapping toward the image card -->
		<path
			d="M -60 480 C 180 380 380 460 560 560 C 700 650 700 800 560 900 L -80 900 Z"
			fill="url(#wc-blob)"
		/>
		<path
			d="M -80 620 C 200 520 460 560 650 680 C 780 760 720 880 580 940 L -100 940 Z"
			fill="url(#wc-blob-2)"
		/>

		<!-- Thin flowing line, upper right -->
		<path
			d="M 1150 30 C 1000 70 980 200 1090 250 C 1210 305 1230 430 1090 470 C 990 500 940 560 1010 640"
			fill="none"
			stroke={accentColor}
			stroke-width="1.5"
			stroke-opacity="0.6"
		/>
	</svg>

	<!-- Left: framed image card -->
	<div class="card" style="--accent: {accentColor};">
		{#if image}
			<img src={image} alt="" />
		{:else}
			<div class="placeholder">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="56"
					height="56"
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

	<!-- Right: copy -->
	<div class="copy">
		<h2 style="color: {headingColor};">{heading}</h2>
		<p style="color: {textColor};">{body}</p>
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

	.card {
		position: absolute;
		top: 50%;
		left: 210px;
		transform: translateY(-50%);
		width: 420px;
		height: 560px;
		background: #ffffff;
		border-radius: 34px;
		padding: 16px;
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.9),
			0 26px 70px -20px color-mix(in srgb, var(--accent) 60%, transparent),
			0 10px 30px -12px rgba(15, 23, 42, 0.18);
		z-index: 1;
	}

	.card img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 22px;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		border-radius: 22px;
		background: linear-gradient(160deg, #e2e6ea 0%, #cfd4d9 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #9aa3ac;
	}

	.copy {
		position: absolute;
		top: 50%;
		left: 700px;
		right: 96px;
		transform: translateY(-50%);
		display: flex;
		flex-direction: column;
		gap: 28px;
		z-index: 2;
		text-align: var(--text-align, left);
	}

	h2 {
		margin: 0;
		font-size: calc(70px * var(--font-scale, 1));
		line-height: 1.08;
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, -0.02em);
	}

	p {
		margin: 0;
		max-width: 560px;
		font-size: calc(20px * var(--font-scale, 1));
		line-height: var(--line-height, 1.95);
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, 0.005em);
	}
</style>
