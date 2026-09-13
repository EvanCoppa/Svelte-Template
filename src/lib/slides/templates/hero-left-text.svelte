<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		backgroundImage,
		logoUrl,
		eyebrow,
		title,
		body,
		buttonText,
		year,
		eyebrowColor,
		titleColor,
		bodyColor,
		buttonColorStart,
		buttonColorEnd,
		overlayColor
	} = $derived({
		backgroundImage: images.backgroundImage,
		logoUrl: images.logo,
		eyebrow: text.eyebrow,
		title: text.title,
		body: text.body,
		buttonText: text.buttonText,
		year: text.year,
		eyebrowColor: colors.eyebrowColor,
		titleColor: colors.titleColor,
		bodyColor: colors.bodyColor,
		buttonColorStart: colors.buttonColorStart,
		buttonColorEnd: colors.buttonColorEnd,
		overlayColor: colors.overlayColor
	});
</script>

<section
	class="slide"
	class:placeholder={!backgroundImage}
	style={`${backgroundImage ? `background: url(${backgroundImage}) center right / cover no-repeat;` : ''} ${styleVars}`}
>
	<!-- Left-to-right fade keeps the text legible over any image -->
	<div
		class="fade"
		style={`background: linear-gradient(to right, ${overlayColor} 0%, ${overlayColor} 30%, ${overlayColor}cc 48%, ${overlayColor}00 68%);`}
	></div>

	{#if logoUrl}
		<img class="logo" src={logoUrl} alt="" />
	{/if}

	{#if year}
		<span class="year" style="color: {titleColor};">{year}</span>
	{/if}

	<div class="content">
		{#if eyebrow}
			<p class="eyebrow" style="color: {eyebrowColor};">{eyebrow}</p>
		{/if}
		<h1 style="color: {titleColor};">{title}</h1>
		{#if body}
			<p class="body" style="color: {bodyColor};">{body}</p>
		{/if}
		{#if buttonText}
			<span
				class="button"
				style={`background: linear-gradient(135deg, ${buttonColorStart} 0%, ${buttonColorEnd} 100%);`}
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
		display: flex;
		align-items: var(--content-justify, center);
		background-repeat: no-repeat;
	}

	.slide.placeholder {
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
	}

	.fade {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.logo {
		position: absolute;
		top: 48px;
		left: 72px;
		width: 56px;
		height: 56px;
		object-fit: contain;
		z-index: 2;
	}

	.year {
		position: absolute;
		top: 52px;
		right: 72px;
		font-size: calc(30px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: var(--letter-spacing, 0.05em);
		z-index: 2;
	}

	.content {
		position: relative;
		z-index: 2;
		max-width: 720px;
		padding: 0 72px;
		text-align: var(--text-align, left);
	}

	.eyebrow {
		font-size: calc(30px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, 0.01em);
		margin: 0 0 12px 0;
	}

	h1 {
		font-size: calc(132px * var(--font-scale, 1));
		line-height: var(--line-height, 1);
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, -0.02em);
		margin: 0 0 24px 0;
	}

	.body {
		font-size: calc(26px * var(--font-scale, 1));
		line-height: var(--line-height, 1.5);
		font-weight: var(--font-weight, 400);
		margin: 0 0 40px 0;
		max-width: 560px;
	}

	.button {
		display: inline-block;
		padding: 18px 44px;
		border-radius: 9999px;
		color: #ffffff;
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		box-shadow: 0 20px 40px -12px rgba(37, 99, 235, 0.5);
	}
</style>
