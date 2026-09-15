<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		body,
		imageLeft,
		imageRight,
		step1Title,
		step1Body,
		step2Title,
		step2Body,
		step3Title,
		step3Body,
		backgroundColor,
		headingColor,
		textColor,
		accentColor,
		numberColor
	} = $derived({
		heading: text.heading,
		body: text.body,
		imageLeft: images.imageLeft,
		imageRight: images.imageRight,
		step1Title: text.step1Title,
		step1Body: text.step1Body,
		step2Title: text.step2Title,
		step2Body: text.step2Body,
		step3Title: text.step3Title,
		step3Body: text.step3Body,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor,
		numberColor: colors.numberColor
	});

	const steps = $derived([
		{ n: '01', title: step1Title, body: step1Body },
		{ n: '02', title: step2Title, body: step2Body },
		{ n: '03', title: step3Title, body: step3Body }
	]);
</script>

<section class="slide" style="background: {backgroundColor}; --accent: {accentColor}; {styleVars}">
	<!-- Decorative background -->
	<svg class="decor" viewBox="0 0 1400 850" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		<defs>
			<linearGradient id="wb-blob" x1="0.1" y1="0.1" x2="0.9" y2="1">
				<stop offset="0" stop-color="color-mix(in srgb, {accentColor} 42%, white 58%)" />
				<stop offset="1" stop-color="color-mix(in srgb, {accentColor} 82%, white 18%)" />
			</linearGradient>
		</defs>
		<!-- large blue blob, bottom-right -->
		<path
			d="M 1400 470 C 1240 470 1150 560 1130 660 C 1112 748 980 780 850 810 C 810 820 1400 850 1400 850 Z"
			fill="url(#wb-blob)"
		/>
		<!-- thin flowing line down the middle-left -->
		<path
			d="M 90 120 C 55 300 210 360 190 500 C 172 630 470 640 480 470 C 486 360 360 320 420 210"
			fill="none"
			stroke={accentColor}
			stroke-width="1.5"
			stroke-opacity="0.5"
		/>
	</svg>

	<!-- Heading + body -->
	<div class="intro">
		<h2 style="color: {headingColor};">{heading}</h2>
		<p style="color: {textColor};">{body}</p>
	</div>

	<!-- Numbered steps -->
	<div class="steps">
		{#each steps as step (step.n)}
			<div class="step">
				<div class="badge" style="background: {numberColor};">{step.n}</div>
				<div class="step-copy">
					<h3 style="color: {headingColor};">{step.title}</h3>
					<p style="color: {textColor};">{step.body}</p>
				</div>
			</div>
		{/each}
	</div>

	<!-- Left photo (portrait, taller) -->
	<div class="frame frame-left">
		{#if imageLeft}
			<img src={imageLeft} alt="" />
		{:else}
			<div class="placeholder">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="46"
					height="46"
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

	<!-- Right photo (portrait, shorter, staggered) -->
	<div class="frame frame-right">
		{#if imageRight}
			<img src={imageRight} alt="" />
		{:else}
			<div class="placeholder">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="46"
					height="46"
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
</section>

<style>
	.slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
	}

	.decor {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.intro {
		position: absolute;
		left: 172px;
		top: 118px;
		width: 430px;
		z-index: 2;
		text-align: var(--text-align, left);
	}

	.intro h2 {
		margin: 0 0 22px;
		font-size: calc(58px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: 1.08;
		letter-spacing: var(--letter-spacing, -0.02em);
		white-space: pre-line;
	}

	.intro p {
		margin: 0;
		max-width: 410px;
		font-size: calc(15px * var(--font-scale, 1));
		line-height: var(--line-height, 1.7);
		font-weight: var(--font-weight, 400);
	}

	.steps {
		position: absolute;
		left: 172px;
		top: 366px;
		width: 400px;
		display: flex;
		flex-direction: column;
		gap: 34px;
		z-index: 2;
	}

	.step {
		display: flex;
		align-items: flex-start;
		gap: 22px;
	}

	.badge {
		flex-shrink: 0;
		width: 54px;
		height: 54px;
		border-radius: 50%;
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 17px;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.step-copy h3 {
		margin: 4px 0 8px;
		font-size: calc(18px * var(--font-scale, 1));
		font-weight: 700;
	}

	.step-copy p {
		margin: 0;
		max-width: 300px;
		font-size: calc(14px * var(--font-scale, 1));
		line-height: var(--line-height, 1.6);
		font-weight: var(--font-weight, 400);
	}

	.frame {
		position: absolute;
		background: #ffffff;
		padding: 9px;
		border-radius: 30px;
		box-shadow:
			0 22px 55px -20px color-mix(in srgb, var(--accent) 55%, transparent),
			0 8px 24px -12px rgba(15, 23, 42, 0.16);
		z-index: 1;
	}

	.frame img,
	.frame .placeholder {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 22px;
		display: block;
	}

	.placeholder {
		background: linear-gradient(160deg, #e2e6ea 0%, #cfd4d9 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #9aa3ac;
	}

	.frame-left {
		left: 600px;
		top: 148px;
		width: 268px;
		height: 500px;
	}

	.frame-right {
		left: 892px;
		top: 214px;
		width: 250px;
		height: 384px;
	}
</style>
