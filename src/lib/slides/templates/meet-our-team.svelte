<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		body,
		name1,
		role1,
		image1,
		name2,
		role2,
		image2,
		name3,
		role3,
		image3,
		name4,
		role4,
		image4,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		heading: text.heading,
		body: text.body,
		name1: text.name1,
		role1: text.role1,
		image1: images.image1,
		name2: text.name2,
		role2: text.role2,
		image2: images.image2,
		name3: text.name3,
		role3: text.role3,
		image3: images.image3,
		name4: text.name4,
		role4: text.role4,
		image4: images.image4,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	// Top row: avatar on the left. Bottom row: avatar on the right (mirrored).
	const members = $derived([
		{ name: name1, role: role1, image: image1, reverse: false, x: 214, y: 236 },
		{ name: name2, role: role2, image: image2, reverse: false, x: 686, y: 236 },
		{ name: name3, role: role3, image: image3, reverse: true, x: 190, y: 430 },
		{ name: name4, role: role4, image: image4, reverse: true, x: 662, y: 430 }
	]);
</script>

<section class="slide" style="background: {backgroundColor}; --accent: {accentColor}; {styleVars}">
	<!-- Decorative background -->
	<svg class="decor" viewBox="0 0 1400 850" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		<defs>
			<linearGradient id="mt-blob" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="color-mix(in srgb, {accentColor} 38%, white 62%)" />
				<stop offset="1" stop-color="color-mix(in srgb, {accentColor} 82%, white 18%)" />
			</linearGradient>
		</defs>
		<!-- large wavy blue band, right side -->
		<path
			d="M 1400 0 L 1400 850 L 1030 850 C 930 760 1120 650 1045 545 C 985 460 895 435 950 322 C 1002 214 918 120 1045 40 C 1085 14 1150 0 1400 0 Z"
			fill="url(#mt-blob)"
		/>
		<!-- thin flowing line, left edge -->
		<path
			d="M 150 20 C 55 170 135 300 92 435 C 55 552 165 625 255 705"
			fill="none"
			stroke={accentColor}
			stroke-width="1.5"
			stroke-opacity="0.45"
		/>
		<!-- thin flowing line, lower center -->
		<path
			d="M 470 470 C 452 590 500 700 470 810"
			fill="none"
			stroke={accentColor}
			stroke-width="1.5"
			stroke-opacity="0.35"
		/>
	</svg>

	<!-- Heading + subtitle -->
	<div class="intro">
		<h2 style="color: {headingColor};">{heading}</h2>
		<p style="color: {textColor};">{body}</p>
	</div>

	<!-- Member cards -->
	{#each members as m (m.name + m.x)}
		<div class="member {m.reverse ? 'reverse' : ''}" style="left: {m.x}px; top: {m.y}px;">
			<div class="avatar">
				{#if m.image}
					<img src={m.image} alt="" />
				{:else}
					<div class="placeholder">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="40"
							height="40"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle
								cx="12"
								cy="7"
								r="4"
							/></svg
						>
					</div>
				{/if}
			</div>
			<div class="card">
				<h3 style="color: {headingColor};">{m.name}</h3>
				<p style="color: {textColor};">{m.role}</p>
			</div>
		</div>
	{/each}
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
		top: 52px;
		left: 0;
		right: 0;
		z-index: 2;
		text-align: center;
		padding: 0 40px;
	}

	.intro h2 {
		margin: 0 0 18px;
		font-size: calc(62px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: 1.05;
		letter-spacing: var(--letter-spacing, -0.02em);
	}

	.intro p {
		margin: 0 auto;
		max-width: 720px;
		font-size: calc(15px * var(--font-scale, 1));
		line-height: var(--line-height, 1.7);
		font-weight: var(--font-weight, 400);
	}

	.member {
		position: absolute;
		display: flex;
		align-items: center;
		z-index: 1;
	}

	.member.reverse {
		flex-direction: row-reverse;
	}

	.avatar {
		position: relative;
		z-index: 2;
		flex-shrink: 0;
		width: 152px;
		height: 152px;
		border-radius: 50%;
		padding: 8px;
		background: #ffffff;
		box-shadow:
			0 12px 40px -10px color-mix(in srgb, var(--accent) 70%, transparent),
			0 6px 18px -8px rgba(15, 23, 42, 0.2);
	}

	.avatar img,
	.avatar .placeholder {
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

	.card {
		position: relative;
		z-index: 1;
		margin-left: -46px;
		padding: 24px 34px 24px 74px;
		min-width: 220px;
		background: #ffffff;
		border-radius: 18px;
		box-shadow: 0 16px 40px -18px rgba(15, 23, 42, 0.22);
		text-align: left;
	}

	.member.reverse .card {
		margin-left: 0;
		margin-right: -46px;
		padding: 24px 74px 24px 34px;
		text-align: right;
	}

	.card h3 {
		margin: 0 0 6px;
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: 700;
	}

	.card p {
		margin: 0;
		font-size: calc(15px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
	}
</style>
