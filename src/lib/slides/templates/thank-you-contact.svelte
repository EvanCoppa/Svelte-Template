<script lang="ts">
	import { SLIDE_THEME } from '../theme';
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		eyebrow,
		heading,
		message,
		contacts,
		ctaLabel,
		logo,
		backgroundImage,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		eyebrow: text.eyebrow,
		heading: text.heading,
		message: text.message,
		contacts: text.contacts,
		ctaLabel: text.ctaLabel,
		logo: images.logo,
		backgroundImage: images.backgroundImage,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	// Fixed icon library so contact chips stay on-brand without free-form SVG.
	const ICONS = new Map([
		[
			'phone',
			'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'
		],
		[
			'mail',
			'<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'
		],
		[
			'globe',
			'<circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/>'
		],
		[
			'pin',
			'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'
		],
		['clock', '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'],
		[
			'calendar',
			'<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'
		],
		['chat', '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>']
	]);

	let parsedContacts = $derived(
		contacts
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [label, value, icon] = line.split('|').map((s) => s.trim());
				return {
					label: label ?? '',
					value: value ?? '',
					icon: ICONS.get(icon?.toLowerCase() ?? '') ?? ICONS.get('chat') ?? ''
				};
			})
	);
</script>

<section
	class="slide"
	style="background: linear-gradient(140deg, {backgroundColor}, {SLIDE_THEME.navy}); {styleVars}"
>
	{#if backgroundImage}
		<img class="bg" src={backgroundImage} alt="" />
		<div class="scrim"></div>
	{/if}

	<div class="glow" style="background: {accentColor};" aria-hidden="true"></div>

	<div class="wrap">
		{#if logo}
			<img class="logo" src={logo} alt="" />
		{/if}

		{#if eyebrow}
			<div class="eyebrow" style="color: {accentColor};">{eyebrow}</div>
		{/if}

		<h2 style="color: {headingColor};">{heading}</h2>

		{#if message}
			<p class="message" style="color: {textColor};">{message}</p>
		{/if}

		{#if parsedContacts.length}
			<div class="chips">
				{#each parsedContacts as item, i (i)}
					<div class="chip">
						<span class="chip-icon" style="color: {accentColor};">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<!-- eslint-disable-next-line svelte/no-at-html-tags — markup comes from the fixed ICONS map above, never user input -->
								{@html item.icon}
							</svg>
						</span>
						<span class="chip-copy">
							{#if item.label}
								<span class="chip-label" style="color: {textColor};">{item.label}</span>
							{/if}
							<span class="chip-value" style="color: {headingColor};">{item.value}</span>
						</span>
					</div>
				{/each}
			</div>
		{/if}

		{#if ctaLabel}
			<div class="cta" style="background: {accentColor};">{ctaLabel}</div>
		{/if}
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(140deg, rgba(11, 26, 43, 0.88), rgba(11, 26, 43, 0.94));
	}

	/* Soft accent bloom behind the headline, kept subtle enough to print. */
	.glow {
		position: absolute;
		width: 720px;
		height: 720px;
		border-radius: 50%;
		top: -260px;
		right: -180px;
		opacity: 0.16;
		filter: blur(40px);
	}

	.wrap {
		position: relative;
		z-index: 1;
		padding: calc(64px * var(--padding-scale, 1)) calc(96px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 22px;
		text-align: center;
		max-width: 1120px;
	}

	.logo {
		height: 72px;
		max-width: 260px;
		object-fit: contain;
		margin-bottom: 10px;
	}

	.eyebrow {
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	h2 {
		font-size: calc(88px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		line-height: 1.05;
		letter-spacing: var(--letter-spacing, -0.025em);
		text-align: var(--text-align, center);
		margin: 0;
	}

	.message {
		font-size: calc(25px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.5);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, center);
		margin: 0;
		max-width: 800px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 18px;
		margin-top: 22px;
	}

	.chip {
		display: flex;
		align-items: center;
		gap: 14px;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 18px;
		padding: 16px 24px;
		text-align: left;
	}

	.chip-icon svg {
		width: 26px;
		height: 26px;
		display: block;
	}

	.chip-copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.chip-label {
		font-size: calc(13px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.75;
	}

	.chip-value {
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: 600;
		line-height: 1.25;
	}

	.cta {
		margin-top: 20px;
		color: #ffffff;
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.02em;
		padding: 18px 42px;
		border-radius: 999px;
		box-shadow: 0 20px 40px -22px rgba(37, 99, 235, 0.8);
	}
</style>
