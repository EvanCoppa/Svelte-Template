<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		imageUrl,
		heading,
		providerName,
		credentials,
		bio,
		backgroundColor,
		headingColor,
		accentColor,
		textColor
	} = $derived({
		imageUrl: images.photo,
		heading: text.heading,
		providerName: text.providerName,
		credentials: text.credentials,
		bio: text.bio,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		accentColor: colors.accentColor,
		textColor: colors.textColor
	});
</script>

<section class="slide" style="background-color: {backgroundColor}; {styleVars}">
	<div class="grid">
		<div class="left">
			<div class="frame">
				<div class="square tl" style="background-color: {accentColor};"></div>
				{#if imageUrl}
					<img src={imageUrl} alt={providerName} class="photo" />
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
							><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle
								cx="12"
								cy="7"
								r="4"
							/></svg
						>
					</div>
				{/if}
				<div class="square br" style="background-color: {accentColor};"></div>
			</div>
		</div>
		<div class="right">
			<div class="copy">
				{#if heading}
					<p class="eyebrow" style="color: {accentColor};">
						{heading}
					</p>
				{/if}
				<h2 class="name" style="color: {headingColor};">
					{providerName}
				</h2>
				{#if credentials}
					<p class="credentials" style="color: {textColor};">
						{credentials}
					</p>
				{/if}
				<div class="rule" style="background-color: {accentColor};"></div>
				<p class="bio" style="color: {textColor};">{bio}</p>
			</div>
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

	.grid {
		display: grid;
		grid-template-columns: 1fr 1.15fr;
		height: 100%;
	}

	.left {
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.frame {
		margin: auto;
		position: relative;
		display: inline-block;
	}

	.square {
		position: absolute;
		width: 96px;
		height: 96px;
		z-index: 1;
	}

	.square.tl {
		top: -35px;
		left: -35px;
	}

	.square.br {
		bottom: -35px;
		right: -35px;
	}

	.photo {
		display: block;
		width: 440px;
		aspect-ratio: 4 / 5;
		object-fit: cover;
		position: relative;
		z-index: 2;
		border-radius: 12px;
	}

	.photo.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 440px;
		aspect-ratio: 4 / 5;
		color: #64748b;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
	}

	.right {
		display: flex;
		flex-direction: column;
		justify-content: var(--content-justify, center);
	}

	.copy {
		max-width: 82%;
		margin: 0 auto;
		padding-right: calc(24px * var(--padding-scale, 1));
		text-align: var(--text-align, left);
	}

	.eyebrow {
		margin: 0 0 14px;
		font-size: calc(16px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: var(--letter-spacing, 0.18em);
		text-transform: uppercase;
	}

	.name {
		margin: 0;
		font-size: calc(56px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		line-height: 1.1;
		letter-spacing: var(--letter-spacing, normal);
	}

	.credentials {
		margin: 10px 0 0;
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: 300;
		letter-spacing: var(--letter-spacing, 0.02em);
		opacity: 0.85;
	}

	.rule {
		width: 72px;
		height: 4px;
		border-radius: 2px;
		margin: 28px 0;
	}

	.bio {
		margin: 0;
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: var(--font-weight, 300);
		line-height: var(--line-height, 1.6);
		letter-spacing: var(--letter-spacing, normal);
		white-space: pre-wrap;
	}
</style>
