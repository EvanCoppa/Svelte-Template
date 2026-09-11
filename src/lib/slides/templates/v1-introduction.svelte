<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const { imageUrl, accentColor, textColor, body } = $derived({
		imageUrl: images.photo,
		accentColor: colors.accentColor,
		textColor: colors.textColor,
		body: text.body
	});
</script>

<section class="slide" style={styleVars}>
	<div class="grid">
		<div class="left">
			<div class="frame">
				<div class="square tl" style="background-color: {accentColor};"></div>
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
				<div class="square br" style="background-color: {accentColor};"></div>
			</div>
		</div>
		<div class="right" style="color: {textColor};">
			<p class="copy">{body}</p>
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
		grid-template-columns: 1fr 1fr;
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
		max-width: 80%;
		margin: 0 auto;
		padding-right: calc(24px * var(--padding-scale, 1));
		font-size: calc(18px * var(--font-scale, 1));
		font-weight: var(--font-weight, 200);
		line-height: var(--line-height, 23px);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		white-space: pre-wrap;
	}
</style>
