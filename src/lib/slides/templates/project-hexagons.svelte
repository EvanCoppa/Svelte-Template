<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		image1,
		image2,
		image3,
		title,
		body,
		metaLine1,
		metaLine2,
		titleColor,
		bannerColor,
		bodyColor,
		metaColor,
		hexAccentColor,
		backgroundColor
	} = $derived({
		image1: images.image1,
		image2: images.image2,
		image3: images.image3,
		title: text.title,
		body: text.body,
		metaLine1: text.metaLine1,
		metaLine2: text.metaLine2,
		titleColor: colors.titleColor,
		bannerColor: colors.bannerColor,
		bodyColor: colors.bodyColor,
		metaColor: colors.metaColor,
		hexAccentColor: colors.hexAccentColor,
		backgroundColor: colors.backgroundColor
	});

	/** Arrow banner fill. */
	/** Body text colour (sits on the banner). */
	/** Solid hexagons behind the photos. */

	// Flat-top honeycomb. Two large photos stack in the left column; a smaller
	// photo and two solid accents sit in the right column, offset half a cell
	// down so the whole thing reads as one continuous honeycomb bleeding off
	// the top / right / bottom edges.
	const BW = 348; // big cell render width
	const BH = 301; // BW * √3/2
	const SW = 250; // small cell render width
	const SH = 216;

	const photos = [
		{ n: 1, cx: 1068, cy: 262, w: BW, h: BH }, // top
		{ n: 2, cx: 1068, cy: 574, w: BW, h: BH }, // below
		{ n: 3, cx: 1353, cy: 418, w: SW, h: SH } // right (smaller, bleeds)
	];
	const accents = [
		{ cx: 1353, cy: 117, w: BW, h: BH }, // upper-right (bleeds top/right)
		{ cx: 1353, cy: 719, w: BW, h: BH } // lower-right (bleeds bottom/right)
	];

	const pos = (h: { cx: number; cy: number; w: number; h: number }) =>
		`left:${h.cx - h.w / 2}px; top:${h.cy - h.h / 2}px; width:${h.w}px; height:${h.h}px;`;

	const srcFor = (n: number) => (n === 1 ? image1 : n === 2 ? image2 : image3);
</script>

<section class="slide" style={`background:${backgroundColor}; ${styleVars}`}>
	<!-- Right-side honeycomb: solid accents behind, photos in front -->
	<div class="cluster">
		{#each accents as h (h.cy)}
			<div class="hex" style={`${pos(h)} background:${hexAccentColor};`}></div>
		{/each}
		{#each photos as h (h.n)}
			{@const src = srcFor(h.n)}
			<div class="hex photo" class:placeholder={!src} style={pos(h)}>
				{#if src}<img {src} alt="" />{/if}
			</div>
		{/each}
	</div>

	<!-- Title -->
	<h1 class="title" style={`color:${titleColor};`}>{title}</h1>

	<!-- Arrow banner with body copy -->
	{#if body}
		<div class="banner" style={`background:${bannerColor};`}>
			<p style={`color:${bodyColor};`}>{body}</p>
		</div>
	{/if}

	<!-- Meta lines -->
	<div class="meta" style={`color:${metaColor};`}>
		{#if metaLine1}<span>{metaLine1}</span>{/if}
		{#if metaLine2}<span>{metaLine2}</span>{/if}
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
		clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0 50%);
	}

	.hex.photo {
		filter: drop-shadow(0 24px 44px rgba(15, 40, 70, 0.28));
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

	.title {
		position: absolute;
		left: 72px;
		top: 118px;
		margin: 0;
		z-index: 2;
		font-size: calc(96px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: var(--line-height, 1);
		letter-spacing: var(--letter-spacing, -0.015em);
	}

	/* Right-pointing banner; bleeds off the left edge. */
	.banner {
		position: absolute;
		left: 0;
		top: 372px;
		width: 700px;
		height: 250px;
		z-index: 2;
		display: flex;
		align-items: center;
		clip-path: polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%);
	}

	.banner p {
		margin: 0;
		padding: 0 150px 0 88px;
		font-size: calc(23px * var(--font-scale, 1));
		line-height: var(--line-height, 1.5);
		font-weight: var(--font-weight, 400);
	}

	.meta {
		position: absolute;
		left: 90px;
		top: 690px;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: calc(24px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
</style>
