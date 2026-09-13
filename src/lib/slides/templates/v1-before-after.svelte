<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		headingColor,
		backgroundColor,
		labelColor,
		dividerColor,
		beforeImageUrl,
		afterImageUrl,
		beforeLabel,
		afterLabel,
		caption,
		logoUrl,
		showLogo
	} = $derived({
		heading: text.heading,
		headingColor: colors.headingColor,
		backgroundColor: colors.backgroundColor,
		labelColor: colors.labelColor,
		dividerColor: colors.dividerColor,
		beforeImageUrl: images.beforePhoto,
		afterImageUrl: images.afterPhoto,
		beforeLabel: text.beforeLabel,
		afterLabel: text.afterLabel,
		caption: text.caption,
		logoUrl: images.logo,
		showLogo: text.showLogo === 'true'
	});

	let hasBefore = $derived(!!beforeImageUrl);
	let hasAfter = $derived(!!afterImageUrl);
	let hasBoth = $derived(hasBefore && hasAfter);
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if showLogo && logoUrl}
				<img src={logoUrl} alt="" class="logo" />
			{/if}
		</div>

		<div class="photos">
			{#if hasBefore}
				<div class="photo-card" class:single={!hasBoth}>
					<div class="frame">
						<img src={beforeImageUrl} alt="Before" class="img" />
					</div>
					<span class="label" style="background: {dividerColor}; color: {labelColor};"
						>{beforeLabel}</span
					>
				</div>
			{:else}
				<div class="photo-card placeholder-card">
					<div class="frame placeholder-frame">
						<div class="placeholder-img">
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
								><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle
									cx="9"
									cy="9"
									r="2"
								/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg
							>
							<span class="placeholder-text">{beforeLabel} Photo</span>
						</div>
					</div>
					<span class="label" style="background: {dividerColor}; color: {labelColor};"
						>{beforeLabel}</span
					>
				</div>
			{/if}

			<div class="divider" style="background: {dividerColor};"></div>

			{#if hasAfter}
				<div class="photo-card" class:single={!hasBoth}>
					<div class="frame">
						<img src={afterImageUrl} alt="After" class="img" />
					</div>
					<span class="label" style="background: {dividerColor}; color: {labelColor};"
						>{afterLabel}</span
					>
				</div>
			{:else}
				<div class="photo-card placeholder-card">
					<div class="frame placeholder-frame">
						<div class="placeholder-img">
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
								><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle
									cx="9"
									cy="9"
									r="2"
								/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg
							>
							<span class="placeholder-text">{afterLabel} Photo</span>
						</div>
					</div>
					<span class="label" style="background: {dividerColor}; color: {labelColor};"
						>{afterLabel}</span
					>
				</div>
			{/if}
		</div>

		{#if caption}
			<p class="caption">{caption}</p>
		{/if}
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		display: flex;
		align-items: var(--content-justify, center);
	}

	.wrap {
		margin: 0 auto;
		width: 100%;
		padding: calc(48px * var(--padding-scale, 1)) calc(72px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 20px;
	}

	h2 {
		font-size: calc(52px * var(--font-scale, 1));
		font-weight: var(--font-weight, 300);
		letter-spacing: var(--letter-spacing, normal);
		margin: 0;
		text-align: var(--text-align, center);
	}

	.logo {
		height: 60px;
		width: 60px;
		object-fit: contain;
	}

	.photos {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 32px;
		flex: 1;
	}

	.photo-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		flex: 1;
		max-width: 560px;
	}

	.photo-card.single {
		max-width: 720px;
	}

	.frame {
		background: #f9fafb;
		padding: 16px;
		border-radius: 14px;
		box-shadow: 0 12px 28px rgba(2, 6, 23, 0.1);
		width: 100%;
		box-sizing: border-box;
	}

	.img {
		width: 100%;
		height: 500px;
		object-fit: cover;
		display: block;
		border-radius: 10px;
	}

	.photo-card.single .img {
		height: 580px;
	}

	.label {
		font-size: 18px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 2px;
		padding: 8px 28px;
		border-radius: 24px;
	}

	.divider {
		width: 4px;
		height: 420px;
		border-radius: 2px;
		flex-shrink: 0;
		opacity: 0.5;
	}

	.caption {
		margin: 0;
		font-size: calc(22px * var(--font-scale, 1));
		color: #6b7280;
		font-weight: var(--font-weight, 500);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, center);
	}

	.placeholder-card {
		max-width: 560px;
	}

	.placeholder-frame {
		background: #f3f4f6;
		border: 3px dashed #d1d5db;
	}

	.placeholder-img {
		width: 100%;
		height: 500px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: #9ca3af;
		border-radius: 10px;
	}

	.placeholder-text {
		font-size: 18px;
		font-weight: 500;
		color: #9ca3af;
	}
</style>
