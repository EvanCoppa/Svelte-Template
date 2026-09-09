<script lang="ts">
	import { pairs } from '../present';
	import { SLIDE_THEME } from '../theme';
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();

	const contacts = $derived(pairs(text.contacts));
</script>

<section
	class="slide"
	style="background: linear-gradient(140deg, {colors.backgroundColor}, {SLIDE_THEME.navy}); color: {colors.textColor}; {styleVars}"
>
	{#if images.backgroundImage}
		<img class="bg" src={images.backgroundImage} alt="" />
		<div class="scrim"></div>
	{/if}
	<div class="glow" style="background: {colors.accentColor};"></div>
	<div class="wrap">
		{#if images.logo}<img class="logo" src={images.logo} alt="" />{/if}
		<p class="eyebrow" style="color: {colors.accentColor};">{text.eyebrow}</p>
		<h2 style="color: {colors.headingColor};">{text.heading}</h2>
		{#if text.message}<p class="message">{text.message}</p>{/if}
		{#if contacts.length > 0}
			<div class="chips">
				{#each contacts as line, i (i)}
					<div class="chip">
						<span class="label">{line.left}</span>
						<span class="value" style="color: {colors.headingColor};">{line.right}</span>
					</div>
				{/each}
			</div>
		{/if}
		{#if text.ctaLabel}
			<span class="cta" style="background: {colors.accentColor};">{text.ctaLabel}</span>
		{/if}
	</div>
</section>

<style>
	.slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		display: flex;
		align-items: var(--content-justify, center);
		justify-content: center;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(140deg, rgba(11, 26, 43, 0.88), rgba(11, 26, 43, 0.94));
	}
	.glow {
		position: absolute;
		top: -260px;
		right: -180px;
		width: 720px;
		height: 720px;
		border-radius: 50%;
		opacity: 0.16;
		filter: blur(40px);
	}
	.wrap {
		position: relative;
		max-width: 1120px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 22px;
		padding: calc(64px * var(--padding-scale, 1)) calc(96px * var(--padding-scale, 1));
		text-align: var(--text-align, center);
	}
	.logo {
		height: 72px;
		width: auto;
		object-fit: contain;
	}
	.eyebrow {
		margin: 0;
		font-size: calc(18px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0;
		font-size: calc(88px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.02em);
		line-height: 1;
	}
	.message {
		margin: 0;
		font-size: calc(25px * var(--font-scale, 1));
		line-height: var(--line-height, 1.45);
		white-space: pre-line;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 14px;
		margin-top: 10px;
	}
	.chip {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 16px 24px;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.14);
	}
	.label {
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.8;
	}
	.value {
		font-size: 21px;
		font-weight: 600;
	}
	.cta {
		margin-top: 12px;
		padding: 18px 42px;
		border-radius: 999px;
		color: #fff;
		font-size: 20px;
		font-weight: 700;
		box-shadow: 0 20px 40px -22px rgba(37, 99, 235, 0.8);
	}
</style>
