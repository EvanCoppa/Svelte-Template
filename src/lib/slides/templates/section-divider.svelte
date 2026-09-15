<script lang="ts">
	import { SLIDE_THEME } from '../theme';
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		sectionNumber,
		eyebrow,
		heading,
		subheading,
		image,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		sectionNumber: text.sectionNumber,
		eyebrow: text.eyebrow,
		heading: text.heading,
		subheading: text.subheading,
		image: images.image,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});
</script>

<section
	class="slide"
	style="background: linear-gradient(125deg, {backgroundColor}, {SLIDE_THEME.navy}); {styleVars}"
>
	<!-- Oversized numeral sits behind the copy as a watermark, not as content. -->
	<div class="ghost" style="color: {accentColor};" aria-hidden="true">{sectionNumber}</div>

	<div class="wrap">
		<div class="copy" class:wide={!image}>
			<div class="eyebrow" style="color: {accentColor};">
				<span class="rule" style="background: {accentColor};"></span>
				{eyebrow}
				{#if sectionNumber}<span class="dot">·</span>{sectionNumber}{/if}
			</div>
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if subheading}
				<p class="sub" style="color: {textColor};">{subheading}</p>
			{/if}
		</div>

		{#if image}
			<div class="panel">
				<img src={image} alt="" />
				<div class="panel-tint" style="background: {accentColor};"></div>
			</div>
		{/if}
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		position: relative;
		display: flex;
		align-items: center;
	}

	.ghost {
		position: absolute;
		left: -30px;
		bottom: -180px;
		font-size: 520px;
		font-weight: 800;
		line-height: 1;
		opacity: 0.14;
		letter-spacing: -0.04em;
		user-select: none;
		pointer-events: none;
	}

	.wrap {
		position: relative;
		z-index: 1;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 60px;
		padding-left: calc(96px * var(--padding-scale, 1));
		box-sizing: border-box;
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 720px;
		padding: calc(48px * var(--padding-scale, 1)) 0;
	}

	/* Without the photo panel the headline gets the full width to breathe. */
	.copy.wide {
		max-width: 1040px;
	}

	.copy.wide .sub {
		max-width: 880px;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 14px;
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.rule {
		width: 56px;
		height: 4px;
		border-radius: 2px;
	}

	.dot {
		opacity: 0.6;
	}

	h2 {
		font-size: calc(84px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: 1.05;
		letter-spacing: var(--letter-spacing, -0.025em);
		text-align: var(--text-align, left);
		margin: 0;
	}

	.sub {
		font-size: calc(26px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.5);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		margin: 0;
		max-width: 620px;
	}

	/* Angled photo panel bleeds off the right edge. */
	.panel {
		position: relative;
		width: 560px;
		height: 100%;
		flex-shrink: 0;
		clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%);
		overflow: hidden;
	}

	.panel img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.panel-tint {
		position: absolute;
		inset: 0;
		opacity: 0.18;
		mix-blend-mode: multiply;
	}
</style>
