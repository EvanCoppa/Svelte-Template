<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const { imageUrl, logoUrl, brandName, heading, values, headingColor, textColor } = $derived({
		imageUrl: images.photo,
		logoUrl: images.logo,
		brandName: text.brandName,
		heading: text.heading,
		values: text.values,
		headingColor: colors.headingColor,
		textColor: colors.textColor
	});

	// Newline separated list.
</script>

<section class="slide" style={styleVars}>
	<div class="wrap">
		<div class="left">
			{#if imageUrl}
				<img src={imageUrl} alt="" class="photo" />
			{:else}
				<div class="photo placeholder">
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
			<div class="brand">
				{#if logoUrl}
					<img src={logoUrl} alt="" class="logo" />
				{/if}
				<h3>{brandName}</h3>
			</div>
		</div>
		<div class="right mb-auto flex flex-col">
			<h2 style="color: {headingColor};">{heading}</h2>
			<ul style="color: {textColor};" class="mt-0">
				{#each values.split('\n').filter(Boolean) as v (v)}
					<li>{v}</li>
				{/each}
			</ul>
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
		padding-top: calc(128px * var(--padding-scale, 1));
		box-sizing: border-box;
	}

	.left {
		width: 50%;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.photo {
		height: 550px;
		width: 450px;
		margin: 0 auto;
		object-fit: cover;
		border-radius: 12px;
	}

	.photo.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
		border-radius: 18px;
	}

	.brand {
		display: flex;
		gap: 16px;
		margin: 0 auto;
		align-items: center;
	}

	.logo {
		height: 100px;
		width: 100px;
		object-fit: cover;
	}

	.brand h3 {
		font-size: calc(48px * var(--font-scale, 1));
		font-weight: var(--font-weight, 500);
		margin: 0;
	}

	.right {
		width: 50%;
		display: flex;
		justify-content: center;
	}

	h2 {
		font-size: calc(48px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		margin: 0;
	}

	ul {
		font-size: calc(30px * var(--font-scale, 1));
		font-weight: var(--font-weight, 200);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		margin: 10px 0 0 32px;
		padding: 0;
		list-style: disc;
		line-height: var(--line-height, 1.35);
	}

	li {
		margin: 10px 0;
	}
</style>
