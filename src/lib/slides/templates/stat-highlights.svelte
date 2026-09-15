<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, colors, styleVars }: SlideProps = $props();
	const { heading, subheading, stats, backgroundColor, headingColor, textColor, accentColor } =
		$derived({
			heading: text.heading,
			subheading: text.subheading,
			stats: text.stats,
			backgroundColor: colors.backgroundColor,
			headingColor: colors.headingColor,
			textColor: colors.textColor,
			accentColor: colors.accentColor
		});

	// Fixed icon library (lucide-style strokes). Keys are what editors type
	// as the third segment of a stat line.
	const ICONS = new Map([
		[
			'smile',
			'<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>'
		],
		[
			'heart',
			'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
		],
		[
			'star',
			'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
		],
		[
			'shield',
			'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'
		],
		['award', '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>'],
		[
			'users',
			'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
		],
		['clock', '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'],
		[
			'sparkles',
			'<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>'
		],
		[
			'thumbsup',
			'<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>'
		],
		[
			'calendar',
			'<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'
		],
		['check', '<path d="M20 6 9 17l-5-5"/>'],
		[
			'tooth',
			'<path d="M12 5.5c-1.5-1.7-3-2.5-4.5-2.5C4.5 3 3 5.2 3 7.8c0 4.2 2 6.3 3 12.2.3 1.8 2.5 1.8 3 0 .5-2 .8-4.5 3-4.5s2.5 2.5 3 4.5c.5 1.8 2.7 1.8 3 0 1-5.9 3-8 3-12.2C21 5.2 19.5 3 16.5 3c-1.5 0-3 .8-4.5 2.5Z"/>'
		]
	]);

	let parsedStats = $derived(
		stats
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [value, label, icon] = line.split('|').map((s) => s.trim());
				return {
					value: value ?? '',
					label: label ?? '',
					icon: ICONS.get(icon?.toLowerCase() ?? '') ?? ICONS.get('sparkles') ?? ''
				};
			})
	);
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			<div class="rule" style="background: {accentColor};"></div>
			{#if subheading}
				<p class="sub" style="color: {textColor};">{subheading}</p>
			{/if}
		</div>

		<div class="stats">
			{#each parsedStats as stat, i (i)}
				<div class="stat" style="animation-delay: {0.15 + i * 0.18}s;">
					<div
						class="icon-ring"
						style="color: {accentColor}; background: color-mix(in srgb, {accentColor} 10%, transparent);"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="44"
							height="44"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags — markup comes from the fixed ICONS map above, never user input -->
							{@html stat.icon}
						</svg>
					</div>
					<div class="value" style="color: {headingColor};">{stat.value}</div>
					<div class="label" style="color: {textColor};">{stat.label}</div>
				</div>
			{/each}
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
		align-items: var(--content-justify, center);
	}

	.wrap {
		width: 100%;
		padding: calc(64px * var(--padding-scale, 1)) calc(80px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 72px;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
	}

	h2 {
		font-size: calc(56px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, center);
		margin: 0;
	}

	.rule {
		width: 88px;
		height: 5px;
		border-radius: 3px;
	}

	.sub {
		font-size: calc(24px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, normal);
		line-height: var(--line-height, 1.4);
		text-align: var(--text-align, center);
		margin: 0;
		max-width: 900px;
	}

	.stats {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 48px;
	}

	/*
     * Entrance animation uses fill-mode "backwards" so the element's natural
     * state stays fully visible: environments that don't run animations
     * (print, PDF export, static captures) render the finished slide instead
     * of the opacity-0 first frame.
     */
	.stat {
		flex: 1;
		max-width: 300px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		text-align: center;
		animation: stat-pop 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
	}

	.icon-ring {
		width: 104px;
		height: 104px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #eff6ff; /* fallback if color-mix is unavailable */
	}

	.value {
		font-size: calc(72px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, -0.02em);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.label {
		font-size: calc(20px * var(--font-scale, 1));
		font-weight: var(--font-weight, 600);
		letter-spacing: var(--letter-spacing, 0.08em);
		line-height: var(--line-height, 1.3);
		text-transform: uppercase;
	}

	@keyframes stat-pop {
		from {
			opacity: 0;
			transform: translateY(28px) scale(0.85);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@media print {
		.stat {
			animation: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.stat {
			animation: none;
		}
	}
</style>
