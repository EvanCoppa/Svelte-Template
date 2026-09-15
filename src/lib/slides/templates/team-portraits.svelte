<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		photo1,
		photo2,
		logoUrl,
		eyebrow,
		titleLine1,
		titleLine2,
		member1Name,
		member1Bio,
		member2Name,
		member2Bio,
		eyebrowColor,
		titleColor,
		nameColor,
		bodyColor,
		crossColorStart,
		crossColorEnd,
		backgroundColor
	} = $derived({
		photo1: images.photo1,
		photo2: images.photo2,
		logoUrl: images.logo,
		eyebrow: text.eyebrow,
		titleLine1: text.titleLine1,
		titleLine2: text.titleLine2,
		member1Name: text.member1Name,
		member1Bio: text.member1Bio,
		member2Name: text.member2Name,
		member2Bio: text.member2Bio,
		eyebrowColor: colors.eyebrowColor,
		titleColor: colors.titleColor,
		nameColor: colors.nameColor,
		bodyColor: colors.bodyColor,
		crossColorStart: colors.crossColorStart,
		crossColorEnd: colors.crossColorEnd,
		backgroundColor: colors.backgroundColor
	});
</script>

<section class="slide" style={`background: ${backgroundColor}; ${styleVars}`}>
	<div class="inner">
		<!-- Left: two side-by-side portraits with a cross badge over the seam -->
		<div class="photos">
			<div class="photo" class:placeholder={!photo1}>
				{#if photo1}<img src={photo1} alt="" />{/if}
			</div>
			<div class="photo" class:placeholder={!photo2}>
				{#if photo2}<img src={photo2} alt="" />{/if}
			</div>

			<div class="badge">
				{#if logoUrl}
					<img class="badge-logo" src={logoUrl} alt="" />
				{:else}
					<span class="badge-ring" style={`border-color: ${crossColorStart};`}></span>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<defs>
							<linearGradient id="teamCrossGradient" x1="0" y1="0" x2="1" y2="1">
								<stop offset="0%" stop-color={crossColorStart} />
								<stop offset="100%" stop-color={crossColorEnd} />
							</linearGradient>
						</defs>
						<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" fill="url(#teamCrossGradient)" />
					</svg>
				{/if}
			</div>
		</div>

		<!-- Right: intro + two member cards -->
		<div class="text">
			{#if eyebrow}
				<p class="eyebrow" style={`color: ${eyebrowColor};`}>{eyebrow}</p>
			{/if}
			<h1 class="title" style={`color: ${titleColor};`}>
				{#if titleLine1}<span>{titleLine1}</span>{/if}
				{#if titleLine2}<span>{titleLine2}</span>{/if}
			</h1>

			<div class="member">
				<h2 style={`color: ${nameColor};`}>{member1Name}</h2>
				{#if member1Bio}<p style={`color: ${bodyColor};`}>{member1Bio}</p>{/if}
			</div>
			<div class="member">
				<h2 style={`color: ${nameColor};`}>{member2Name}</h2>
				{#if member2Bio}<p style={`color: ${bodyColor};`}>{member2Bio}</p>{/if}
			</div>
		</div>
	</div>
</section>

<style>
	.slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		font-family: Arial, Helvetica, sans-serif;
	}

	.inner {
		display: flex;
		gap: 60px;
		height: 100%;
		padding: 70px;
		box-sizing: border-box;
		align-items: stretch;
	}

	.photos {
		position: relative;
		flex: 0 0 600px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
	}

	.photo {
		position: relative;
		border-radius: 26px;
		overflow: hidden;
		box-shadow: 0 26px 50px -18px rgba(15, 40, 70, 0.3);
	}

	.photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.photo.placeholder {
		background: repeating-linear-gradient(45deg, #eef2f5, #eef2f5 14px, #f6f8fa 14px, #f6f8fa 28px);
	}

	/* Cross badge centered over the seam between the two portraits */
	.badge {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 3;
		width: 108px;
		height: 108px;
		border-radius: 50%;
		background: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 18px 40px -12px rgba(15, 40, 70, 0.35);
	}

	.badge-ring {
		position: absolute;
		inset: 9px;
		border-radius: 50%;
		border: 4px solid;
		opacity: 0.85;
	}

	.badge svg {
		position: relative;
		z-index: 1;
		width: 50px;
		height: 50px;
	}

	.badge-logo {
		position: relative;
		z-index: 1;
		width: 72%;
		height: 72%;
		object-fit: contain;
	}

	.text {
		flex: 1;
		align-self: center;
		text-align: var(--text-align, left);
	}

	.eyebrow {
		margin: 0 0 calc(16px * var(--font-scale, 1));
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: 0.01em;
	}

	.title {
		display: flex;
		flex-direction: column;
		margin: 0 0 calc(44px * var(--font-scale, 1));
		font-size: calc(64px * var(--font-scale, 1));
		line-height: var(--line-height, 1.05);
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, -0.02em);
	}

	.member {
		margin-bottom: calc(30px * var(--font-scale, 1));
	}

	.member:last-child {
		margin-bottom: 0;
	}

	.member h2 {
		margin: 0 0 calc(12px * var(--font-scale, 1));
		font-size: calc(27px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
	}

	.member p {
		margin: 0;
		max-width: 480px;
		font-size: calc(19px * var(--font-scale, 1));
		line-height: var(--line-height, 1.6);
		font-weight: 400;
	}
</style>
