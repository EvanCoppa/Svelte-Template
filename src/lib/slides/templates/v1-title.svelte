<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		backgroundImage,
		logoUrl,
		textColor,
		invertLogo,
		titleBackground,
		brandName,
		subtitle,
		doctorName,
		patientName,
		providedByLabel,
		designedForLabel
	} = $derived({
		backgroundImage: images.backgroundImage,
		logoUrl: images.logo,
		textColor: colors.textColor,
		invertLogo: text.invertLogo === 'true',
		titleBackground: text.titleBackground === 'true',
		brandName: text.brandName,
		subtitle: text.subtitle,
		doctorName: text.doctorName,
		patientName: text.patientName,
		providedByLabel: text.providedByLabel,
		designedForLabel: text.designedForLabel
	});
</script>

<section
	class="slide"
	class:placeholder={!backgroundImage}
	style={`${backgroundImage ? `background: url(${backgroundImage}) center center / cover no-repeat;` : ''} ${styleVars}`}
>
	{#if titleBackground}
		<div class="title-bg-overlay"></div>
	{/if}
	<div class="content" style="color: {textColor};">
		<div class="row">
			{#if logoUrl}
				<div class="logo-wrap">
					<img class="logo {invertLogo ? 'invert' : ''}" src={logoUrl} alt="" />
				</div>
			{/if}

			<div class="title ml-6">
				<h1>{brandName}</h1>
				<div class="subtitle">
					<h2>{subtitle}</h2>
					{#if doctorName}
						<h3>
							{providedByLabel}
							{doctorName}
						</h3>
					{/if}
				</div>
			</div>

			<span class="divider" aria-hidden="true"></span>

			<div class="designed text-start">
				<h3>{designedForLabel}</h3>
				<h3>{patientName}</h3>
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
		display: flex;
		align-items: var(--content-justify, flex-end);
		position: relative;
	}

	.title-bg-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 50%;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0) 100%);
		pointer-events: none;
	}

	.slide.placeholder {
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
	}

	.content {
		/* Top margin keeps the heading clear of the slide edge when the
		   vertical position is set to "Top" (the tight h1 line-height would
		   otherwise clip the ascenders). It is inert at the default bottom
		   alignment. */
		margin-top: 56px;
		margin-left: calc(16px * var(--padding-scale, 1));
		margin-bottom: calc(12px * var(--padding-scale, 1));
		text-align: var(--text-align, left);
		text-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		position: relative;
	}

	.row {
		display: flex;
		flex-direction: row;
		gap: 16px;
		align-items: flex-start;
	}

	.logo-wrap {
		display: flex;
	}

	.logo {
		width: 75px;
		margin-left: 16px;
		margin-top: 8px;
		object-fit: contain;
	}

	.logo.invert {
		filter: invert(1);
	}

	h1 {
		font-size: calc(100px * var(--font-scale, 1));
		line-height: 50px;
		margin: 0 0 8px 0;
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.02em);
	}

	.subtitle {
		display: flex;
		align-items: baseline;
		gap: 18px;
	}

	h2 {
		font-size: calc(55px * var(--font-scale, 1));
		margin: 0 0 16px 0;
		font-weight: var(--font-weight, 300);
		letter-spacing: var(--letter-spacing, normal);
	}

	h3 {
		font-size: calc(30px * var(--font-scale, 1));
		margin: 0;
		font-weight: var(--font-weight, 200);
	}

	.divider {
		background: rgba(255, 255, 255, 0.95);
		height: 130px;
		width: 2px;
		margin: 0 32px;
		opacity: 0.95;
	}

	.designed {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 4px;
	}

	.designed h3 {
		font-size: calc(40px * var(--font-scale, 1));
		font-weight: var(--font-weight, 300);
	}
</style>
