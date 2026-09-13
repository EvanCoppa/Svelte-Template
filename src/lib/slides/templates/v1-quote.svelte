<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const { logoUrl, imageUrl, quote, tagline, quoteColor, taglineColor } = $derived({
		logoUrl: images.logo,
		imageUrl: images.photo,
		quote: text.quote,
		tagline: text.tagline,
		quoteColor: colors.quoteColor,
		taglineColor: colors.taglineColor
	});
</script>

<section class="slide" style={styleVars}>
	<div class="wrap">
		<div class="left">
			<h2 style="color: {quoteColor};">{quote}</h2>
			<div class="stack">
				{#if logoUrl}
					<img src={logoUrl} alt="" class="logo" />
				{/if}
				<h3 style="color: {taglineColor};">{tagline}</h3>
			</div>
		</div>
		<div class="right">
			{#if imageUrl}
				<img src={imageUrl} alt="" class="img" />
			{:else}
				<div class="img placeholder">
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
	}

	.wrap {
		display: flex;
		height: 100%;
	}

	.left {
		width: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: var(--content-justify, flex-start);
		padding: calc(64px * var(--padding-scale, 1)) 0;
		box-sizing: border-box;
	}

	h2 {
		font-size: calc(60px * var(--font-scale, 1));
		text-align: var(--text-align, center);
		margin: 32px 0 0 0;
		max-width: 80%;
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, normal);
		letter-spacing: var(--letter-spacing, normal);
	}

	.stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: 140px;
	}

	.logo {
		height: 150px;
		width: 150px;
		object-fit: contain;
	}

	h3 {
		font-size: calc(30px * var(--font-scale, 1));
		font-weight: var(--font-weight, 200);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, center);
		margin: 64px 0 0 0;
	}

	.right {
		width: 50%;
		display: flex;
	}

	.img {
		height: 500px;
		width: 500px;
		object-fit: cover;
		margin: auto;
		border-radius: 12px;
	}

	.img.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
		border-radius: 18px;
	}
</style>
