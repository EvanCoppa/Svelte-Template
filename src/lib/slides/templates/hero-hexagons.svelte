<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		image1,
		image2,
		eyebrow,
		titleLine1,
		titleLine2,
		body,
		buttonText,
		eyebrowColor,
		titleColor,
		bodyColor,
		hexColorDeep,
		hexColorBright,
		accentColor,
		backgroundColor
	} = $derived({
		image1: images.image1,
		image2: images.image2,
		eyebrow: text.eyebrow,
		titleLine1: text.titleLine1,
		titleLine2: text.titleLine2,
		body: text.body,
		buttonText: text.buttonText,
		eyebrowColor: colors.eyebrowColor,
		titleColor: colors.titleColor,
		bodyColor: colors.bodyColor,
		hexColorDeep: colors.hexColorDeep,
		hexColorBright: colors.hexColorBright,
		accentColor: colors.accentColor,
		backgroundColor: colors.backgroundColor
	});

	/** Deep hexagon fill (top-left of the cluster). */
	/** Bright hexagon fill (used for the gradient accents). */
	/** Mid accent — divider line, bullet, right hexagon, button. */

	// Pointy-top honeycomb: a central hero photo (A) surrounded by four of its
	// six lattice neighbours. Cells sit on a 300px lattice but render slightly
	// smaller (RW) so thin white gaps read as the honeycomb "grout".
	const RW = 286;
	const RH = 330; // RW * 2/√3
	const cluster = [
		{ role: 'deep', cx: 855, cy: 165 }, // upper-left  (bleeds top)
		{ role: 'photo2', cx: 1155, cy: 165 }, // upper-right (bleeds top)
		{ role: 'photo1', cx: 1005, cy: 425 }, // centre — hero image
		{ role: 'mid', cx: 1305, cy: 425 }, // right      (bleeds off edge)
		{ role: 'bright', cx: 1155, cy: 685 } // lower-right (bleeds bottom)
	];

	const pos = (h: { cx: number; cy: number }) =>
		`left:${h.cx - RW / 2}px; top:${h.cy - RH / 2}px; width:${RW}px; height:${RH}px;`;
</script>

<section class="slide" style={`background:${backgroundColor}; ${styleVars}`}>
	<!-- Right-side honeycomb cluster -->
	<div class="cluster">
		{#each cluster as h (h.role)}
			{#if h.role === 'photo1' || h.role === 'photo2'}
				{@const src = h.role === 'photo1' ? image1 : image2}
				<div class="hex photo" class:placeholder={!src} style={pos(h)}>
					{#if src}<img {src} alt="" />{/if}
				</div>
			{:else}
				<div
					class="hex"
					style={`${pos(h)} background:${
						h.role === 'deep'
							? hexColorDeep
							: h.role === 'bright'
								? `linear-gradient(150deg, ${hexColorBright}, ${accentColor})`
								: accentColor
					};`}
				></div>
			{/if}
		{/each}
	</div>

	<!-- Bottom-left headline -->
	<div class="content">
		{#if eyebrow}
			<div class="eyebrow-row">
				<span class="bullet" style={`background:${accentColor};`}></span>
				<span class="eyebrow" style={`color:${eyebrowColor};`}>{eyebrow}</span>
			</div>
		{/if}
		<span
			class="rule"
			style={`background:linear-gradient(90deg, ${accentColor}, ${hexColorBright});`}
		></span>
		<h1 class="title" style={`color:${titleColor};`}>
			{#if titleLine1}<span>{titleLine1}</span>{/if}
			{#if titleLine2}<span>{titleLine2}</span>{/if}
		</h1>
		{#if body}<p class="body" style={`color:${bodyColor};`}>{body}</p>{/if}
		{#if buttonText}
			<span
				class="button"
				style={`background:linear-gradient(135deg, ${accentColor}, ${hexColorBright});`}
			>
				{buttonText}
			</span>
		{/if}
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

	.cluster {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.hex {
		position: absolute;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
	}

	.hex.photo {
		box-shadow: 0 30px 60px -24px rgba(15, 40, 70, 0.35);
	}

	.hex img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.hex.placeholder {
		background: repeating-linear-gradient(45deg, #eef2f5, #eef2f5 14px, #f6f8fa 14px, #f6f8fa 28px);
	}

	.content {
		position: absolute;
		left: 110px;
		bottom: 150px;
		z-index: 2;
		text-align: var(--text-align, left);
	}

	.eyebrow-row {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: calc(22px * var(--font-scale, 1));
	}

	.bullet {
		width: 18px;
		height: 20px;
		flex: none;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
	}

	.eyebrow {
		font-size: calc(20px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.rule {
		display: block;
		width: 64px;
		height: 4px;
		border-radius: 2px;
		margin-bottom: calc(28px * var(--font-scale, 1));
	}

	.title {
		display: flex;
		flex-direction: column;
		margin: 0;
		font-size: calc(74px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: var(--line-height, 0.98);
		letter-spacing: var(--letter-spacing, -0.02em);
	}

	.body {
		margin: calc(26px * var(--font-scale, 1)) 0 0;
		max-width: 470px;
		font-size: calc(20px * var(--font-scale, 1));
		line-height: var(--line-height, 1.6);
		font-weight: var(--font-weight, 400);
	}

	.button {
		display: inline-block;
		margin-top: calc(34px * var(--font-scale, 1));
		padding: 16px 40px;
		border-radius: 9999px;
		color: #ffffff;
		font-size: calc(20px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		box-shadow: 0 20px 40px -14px rgba(37, 99, 235, 0.5);
	}
</style>
