<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const { heading, body, image, backgroundColor, headingColor, textColor, accentColor, invert } =
		$derived({
			heading: text.heading,
			body: text.body,
			image: images.image,
			backgroundColor: colors.backgroundColor,
			headingColor: colors.headingColor,
			textColor: colors.textColor,
			accentColor: colors.accentColor,
			invert: text.invert === 'true'
		});
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="grid {invert ? 'invert' : ''}">
		<div class="media">
			{#if image}
				<img src={image} alt="" />
			{:else}
				<div class="placeholder">
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
		<div class="copy">
			<div class="rule" style="background: {accentColor};"></div>
			<h2 style="color: {headingColor};">{heading}</h2>
			<p style="color: {textColor}; white-space: pre-wrap;">{body}</p>
		</div>
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		height: 100%;
	}

	.grid.invert {
		direction: rtl;
	}
	.grid.invert > * {
		direction: ltr;
	}

	.media {
		padding: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 28px;
		box-shadow: 0 30px 60px rgba(2, 6, 23, 0.18);
	}

	.placeholder {
		width: 100%;
		height: 100%;
		border-radius: 28px;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
	}

	.copy {
		padding: calc(92px * var(--padding-scale, 1)) calc(86px * var(--padding-scale, 1));
		display: flex;
		flex-direction: column;
		justify-content: var(--content-justify, center);
		gap: 18px;
		text-align: var(--text-align, left);
	}

	.rule {
		width: 92px;
		height: 6px;
		border-radius: 999px;
	}

	h2 {
		font-size: calc(64px * var(--font-scale, 1));
		letter-spacing: var(--letter-spacing, -0.02em);
		line-height: 1.05;
		margin: 0;
		font-weight: var(--font-weight, 700);
		text-align: var(--text-align, left);
	}

	p {
		font-size: calc(24px * var(--font-scale, 1));
		line-height: var(--line-height, 1.5);
		font-weight: var(--font-weight, 300);
		letter-spacing: var(--letter-spacing, normal);
		margin: 0;
		max-width: 520px;
		text-align: var(--text-align, left);
	}
</style>
