<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors }: SlideProps = $props();
	const { imageUrl, logoUrl, showLogo, heading, caption, headingColor } = $derived({
		imageUrl: images.photo,
		logoUrl: images.logo,
		showLogo: text.showLogo === 'true',
		heading: text.heading,
		caption: text.caption,
		headingColor: colors.headingColor
	});
</script>

<section class="slide">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if showLogo && logoUrl}
				<img src={logoUrl} alt="" class="logo" />
			{/if}
		</div>

		<div class="body">
			<div class="frame">
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
			{#if caption}
				<p class="caption">{caption}</p>
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
		display: flex;
	}

	.wrap {
		margin: auto;
		width: 70%;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.head {
		text-align: center;
	}

	h2 {
		font-size: 60px;
		font-weight: 300;
		margin: 0 0 16px 0;
		text-transform: capitalize;
	}

	.logo {
		height: 100px;
		width: 100px;
		object-fit: contain;
		margin: 0 auto;
	}

	.body {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.frame {
		background: #f9fafb;
		padding: 24px;
		border-radius: 14px;
		box-shadow: 0 16px 30px rgba(2, 6, 23, 0.12);
		max-width: 100%;
	}

	.img {
		max-width: 100%;
		max-height: 600px;
		object-fit: contain;
		display: block;
		border-radius: 10px;
	}

	.img.placeholder {
		width: 1000px;
		height: 600px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
		border-radius: 10px;
	}

	.caption {
		margin: 18px 0 0;
		font-size: 24px;
		color: #6b7280;
		font-weight: 500;
	}
</style>
