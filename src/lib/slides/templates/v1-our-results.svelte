<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const { imageUrl, logoUrl, heading, quote, headingColor, quoteColor } = $derived({
		imageUrl: images.mainImage,
		logoUrl: images.logo,
		heading: text.heading,
		quote: text.quote,
		headingColor: colors.headingColor,
		quoteColor: colors.quoteColor
	});
</script>

<section class="slide" style={styleVars}>
	<div class="wrap">
		{#if imageUrl}
			<img src={imageUrl} alt="" class="hero" />
		{:else}
			<div class="hero placeholder">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
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
		<div class="row">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if logoUrl}
				<img src={logoUrl} alt="" class="logo" />
			{/if}
			<p style="color: {quoteColor};">{quote}</p>
		</div>
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		background: #ffffff;
		display: flex;
		align-items: var(--content-justify, center);
	}

	.wrap {
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 26px;
		width: 100%;
		padding: calc(56px * var(--padding-scale, 1)) calc(96px * var(--padding-scale, 1));
		box-sizing: border-box;
	}

	.hero {
		max-height: 400px;
		width: 100%;
		object-fit: contain;
		margin: 0 auto;
		border-radius: 12px;
	}

	.hero.placeholder {
		height: 400px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
		border-radius: 18px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 64px;
		justify-content: center;
		margin-top: 22px;
	}

	h2 {
		font-size: calc(70px * var(--font-scale, 1));
		font-weight: var(--font-weight, 300);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		margin: 0;
	}

	.logo {
		height: 100px;
		width: 100px;
		object-fit: contain;
	}

	p {
		font-size: calc(14px * var(--font-scale, 1));
		max-width: 350px;
		line-height: var(--line-height, 1.35);
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		margin: 0;
	}
</style>
