<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors }: SlideProps = $props();
	const { logoUrl, heading, quote, headingColor, quoteColor } = $derived({
		logoUrl: images.logo,
		heading: text.heading,
		quote: text.quote,
		headingColor: colors.headingColor,
		quoteColor: colors.quoteColor
	});
</script>

<section class="slide">
	<div class="wrap">
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
	}

	.wrap {
		margin: auto;
		display: flex;
		flex-direction: column;
		gap: 26px;
		width: 100%;
		padding: 56px 96px;
		box-sizing: border-box;
		justify-content: center;
		height: 100%;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 64px;
		justify-content: center;
	}

	h2 {
		font-size: 70px;
		font-weight: 300;
		margin: 0;
	}

	.logo {
		height: 100px;
		width: 100px;
		object-fit: contain;
	}

	p {
		font-size: 14px;
		max-width: 350px;
		line-height: 1.35;
		margin: 0;
	}
</style>
