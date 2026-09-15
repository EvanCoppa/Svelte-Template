<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		body,
		image1,
		image2,
		image3,
		image4,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		heading: text.heading,
		body: text.body,
		image1: images.image1,
		image2: images.image2,
		image3: images.image3,
		image4: images.image4,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	// Clustered circles: {left, top, size}
	const circles = $derived([
		{ image: image1, x: 150, y: 185, d: 152 },
		{ image: image2, x: 345, y: 120, d: 214 },
		{ image: image3, x: 190, y: 352, d: 232 },
		{ image: image4, x: 432, y: 382, d: 188 }
	]);
</script>

<section class="slide" style="background: {backgroundColor}; --accent: {accentColor}; {styleVars}">
	<!-- Decorative background -->
	<svg class="decor" viewBox="0 0 1400 850" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		<defs>
			<linearGradient id="pf-blob" x1="0.15" y1="0.1" x2="0.85" y2="1">
				<stop offset="0" stop-color="color-mix(in srgb, {accentColor} 42%, white 58%)" />
				<stop offset="1" stop-color="color-mix(in srgb, {accentColor} 82%, white 18%)" />
			</linearGradient>
		</defs>
		<!-- large blue blob, bottom-left -->
		<path
			d="M -60 470 C 110 452 210 540 250 640 C 285 726 430 758 560 792 C 600 802 -60 850 -60 850 Z"
			fill="url(#pf-blob)"
		/>
		<!-- thin flowing line, upper-right sweeping down -->
		<path
			d="M 1180 10 C 1360 70 1300 260 1200 320 C 1090 386 1080 520 1180 600 C 1250 656 1230 760 1120 820"
			fill="none"
			stroke={accentColor}
			stroke-width="1.5"
			stroke-opacity="0.45"
		/>
	</svg>

	<!-- Clustered circular photos -->
	{#each circles as c, i (i)}
		<div class="circle" style="left: {c.x}px; top: {c.y}px; width: {c.d}px; height: {c.d}px;">
			{#if c.image}
				<img src={c.image} alt="" />
			{:else}
				<div class="placeholder">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="38"
						height="38"
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
	{/each}

	<!-- Heading + body -->
	<div class="copy">
		<h2 style="color: {headingColor};">{heading}</h2>
		<p style="color: {textColor};">{body}</p>
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

	.circle {
		position: absolute;
		border-radius: 50%;
		padding: 9px;
		background: #ffffff;
		box-shadow:
			0 16px 44px -12px color-mix(in srgb, var(--accent) 70%, transparent),
			0 6px 20px -8px rgba(15, 23, 42, 0.18);
		z-index: 1;
	}

	.circle img,
	.circle .placeholder {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}

	.placeholder {
		background: linear-gradient(160deg, #e2e6ea 0%, #cfd4d9 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #9aa3ac;
	}

	.copy {
		position: absolute;
		left: 718px;
		right: 96px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 2;
		text-align: var(--text-align, left);
	}

	.copy h2 {
		margin: 0 0 26px;
		font-size: calc(64px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: 1.05;
		letter-spacing: var(--letter-spacing, -0.02em);
	}

	.copy p {
		margin: 0;
		max-width: 500px;
		font-size: calc(16px * var(--font-scale, 1));
		line-height: var(--line-height, 1.85);
		font-weight: var(--font-weight, 400);
	}
</style>
