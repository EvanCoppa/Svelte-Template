<script lang="ts">
	import { SLIDE_THEME } from '../theme';
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
</script>

<section
	class="slide"
	style="background: linear-gradient(125deg, {colors.backgroundColor}, {SLIDE_THEME.navy}); color: {colors.textColor}; {styleVars}"
>
	<span class="ghost" style="color: {colors.headingColor};">{text.sectionNumber}</span>
	<div class="copy" class:wide={!images.image}>
		<p class="eyebrow" style="color: {colors.accentColor};">
			<span class="rule" style="background: {colors.accentColor};"></span>
			{text.eyebrow} · {text.sectionNumber}
		</p>
		<h2 style="color: {colors.headingColor};">{text.heading}</h2>
		{#if text.subheading}
			<p class="sub">{text.subheading}</p>
		{/if}
	</div>
	{#if images.image}
		<div class="panel">
			<img src={images.image} alt="" />
			<div class="tint" style="background: {colors.accentColor};"></div>
		</div>
	{/if}
</section>

<style>
	.slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		display: flex;
		align-items: var(--content-justify, center);
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.ghost {
		position: absolute;
		left: -30px;
		bottom: -180px;
		font-size: 520px;
		font-weight: 800;
		line-height: 1;
		opacity: 0.14;
		pointer-events: none;
	}
	.copy {
		position: relative;
		max-width: 720px;
		padding: calc(64px * var(--padding-scale, 1)) calc(96px * var(--padding-scale, 1));
		display: flex;
		flex-direction: column;
		gap: 22px;
		text-align: var(--text-align, left);
	}
	.copy.wide {
		max-width: 1040px;
	}
	.eyebrow {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 16px;
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.rule {
		width: 56px;
		height: 4px;
		border-radius: 2px;
	}
	h2 {
		margin: 0;
		font-size: calc(84px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.02em);
		line-height: 1.02;
	}
	.sub {
		margin: 0;
		font-size: calc(26px * var(--font-scale, 1));
		font-weight: 300;
		line-height: var(--line-height, 1.4);
	}
	.panel {
		position: absolute;
		top: 0;
		right: 0;
		width: 560px;
		height: 100%;
		clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%);
	}
	.panel img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.tint {
		position: absolute;
		inset: 0;
		opacity: 0.18;
		mix-blend-mode: multiply;
	}
</style>
