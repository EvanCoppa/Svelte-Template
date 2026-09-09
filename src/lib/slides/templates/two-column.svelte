<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
</script>

<section
	class="slide"
	style="background: {colors.backgroundColor}; color: {colors.textColor}; {styleVars}"
>
	<div class="media" class:placeholder={!images.image}>
		{#if images.image}
			<img src={images.image} alt="" />
		{/if}
	</div>
	<div class="copy">
		<span class="rule" style="background: {colors.accentColor};"></span>
		<h2 style="color: {colors.headingColor};">{text.heading}</h2>
		<p>{text.body}</p>
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		display: grid;
		grid-template-columns: 1fr 1fr;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.media {
		overflow: hidden;
	}
	.media img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.media.placeholder {
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
	}
	.copy {
		display: flex;
		flex-direction: column;
		justify-content: var(--content-justify, center);
		gap: 22px;
		padding: calc(64px * var(--padding-scale, 1)) calc(80px * var(--padding-scale, 1));
		text-align: var(--text-align, left);
	}
	.rule {
		width: 64px;
		height: 6px;
		border-radius: 3px;
	}
	h2 {
		margin: 0;
		font-size: calc(58px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		line-height: 1.05;
	}
	p {
		margin: 0;
		font-size: calc(26px * var(--font-scale, 1));
		line-height: var(--line-height, 1.5);
		white-space: pre-line;
	}
</style>
