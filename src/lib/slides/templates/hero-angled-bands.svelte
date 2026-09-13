<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const { backgroundImage, eyebrow, title, bandColor, bandColorDeep, textColor } = $derived({
		backgroundImage: images.backgroundImage,
		eyebrow: text.eyebrow,
		title: text.title,
		bandColor: colors.bandColor,
		bandColorDeep: colors.bandColorDeep,
		textColor: colors.textColor
	});
</script>

<section class="slide" class:placeholder={!backgroundImage} style={styleVars}>
	<!-- Full-bleed clinic photo sits behind everything -->
	{#if backgroundImage}
		<img class="clinic-image" src={backgroundImage} alt="" />
	{/if}

	<!-- Subtle left-side wash keeps the headline legible over the photo -->
	<div class="image-wash"></div>

	<!-- Angled teal bands top and bottom -->
	<div
		class="top-band"
		style={`background: linear-gradient(135deg, ${bandColorDeep}, ${bandColor});`}
	></div>
	<div
		class="bottom-band"
		style={`background: linear-gradient(135deg, ${bandColor}, ${bandColorDeep});`}
	></div>

	<!-- Headline is rotated to match the lower edge of the top band -->
	<div class="headline" style={`color: ${textColor};`}>
		{#if eyebrow}
			<p class="eyebrow">{eyebrow}</p>
		{/if}
		<h1 class="title">{title}</h1>
	</div>
</section>

<style>
	.slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		isolation: isolate;
		page-break-after: always;
		background: #ffffff;
		font-family: Arial, Helvetica, sans-serif;
	}

	.slide.placeholder {
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
	}

	.clinic-image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 52%;
		z-index: -3;
		transform: scale(1.015);
	}

	.image-wash {
		position: absolute;
		inset: 0;
		z-index: -2;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.18) 0%,
			rgba(255, 255, 255, 0.05) 35%,
			rgba(255, 255, 255, 0) 68%
		);
	}

	.top-band {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 34%;
		clip-path: polygon(0 0, 100% 0, 100% 42%, 0 100%);
		z-index: 1;
	}

	.bottom-band {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 9%;
		clip-path: polygon(0 72%, 100% 0, 100% 100%, 0 100%);
		z-index: 1;
	}

	.headline {
		position: absolute;
		top: 10.6%;
		left: 5.25%;
		z-index: 2;
		text-transform: uppercase;
		text-shadow: 0 3px 18px rgba(0, 0, 0, 0.08);
		/* Match the angle of the teal header's lower edge */
		transform: rotate(-5.4deg);
		transform-origin: left top;
		text-align: var(--text-align, left);
	}

	.eyebrow {
		margin: 0 0 calc(20px * var(--font-scale, 1));
		font-size: calc(38px * var(--font-scale, 1));
		font-weight: 300;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.title {
		margin: 0;
		font-size: calc(150px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: var(--line-height, 0.82);
		letter-spacing: var(--letter-spacing, -0.055em);
		white-space: nowrap;
	}
</style>
