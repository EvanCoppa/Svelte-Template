<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		eyebrow,
		heading,
		reviews,
		avatar1,
		avatar2,
		avatar3,
		footnote,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		eyebrow: text.eyebrow,
		heading: text.heading,
		reviews: text.reviews,
		avatar1: images.avatar1,
		avatar2: images.avatar2,
		avatar3: images.avatar3,
		footnote: text.footnote,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	const STAR_COLOR = '#f59e0b';

	let avatars = $derived([avatar1, avatar2, avatar3]);

	let parsed = $derived(
		reviews
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [quote, name, detail, rating] = line.split('|').map((s) => s.trim());
				const parsedRating = Number(rating);
				return {
					quote: quote ?? '',
					name: name ?? '',
					detail: detail ?? '',
					rating: Number.isFinite(parsedRating) ? Math.max(0, Math.min(5, parsedRating)) : 5
				};
			})
	);

	/**
	 * Turn a numeric rating into five star states so a 4.5 reads as four solid
	 * stars, one half, and no missing glyph.
	 */
	function starStates(rating: number): ('full' | 'half' | 'empty')[] {
		return Array.from({ length: 5 }, (_, i) => {
			const filled = rating - i;
			if (filled >= 0.75) return 'full';
			if (filled >= 0.25) return 'half';
			return 'empty';
		});
	}

	/** Initials stand in when a review has no headshot uploaded. */
	function initials(name: string): string {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
	}
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			{#if eyebrow}
				<div class="eyebrow" style="color: {accentColor};">{eyebrow}</div>
			{/if}
			<h2 style="color: {headingColor};">{heading}</h2>
		</div>

		<div class="cards">
			{#each parsed as review, i (i)}
				<article class="card" style="animation-delay: {0.1 + i * 0.13}s;">
					<div class="stars" aria-label={`${review.rating} out of 5 stars`}>
						{#each starStates(review.rating) as state, s (s)}
							<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
								<defs>
									<linearGradient id={`half-${i}-${s}`}>
										<stop offset="50%" stop-color={STAR_COLOR} />
										<stop offset="50%" stop-color="#e2e8f0" />
									</linearGradient>
								</defs>
								<polygon
									points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
									fill={state === 'full'
										? STAR_COLOR
										: state === 'half'
											? `url(#half-${i}-${s})`
											: '#e2e8f0'}
								/>
							</svg>
						{/each}
					</div>

					<blockquote style="color: {headingColor};">
						<span class="mark" style="color: {accentColor};">“</span>{review.quote}”
					</blockquote>

					<footer>
						{#if avatars[i]}
							<img class="avatar" src={avatars[i]} alt="" />
						{:else if review.name}
							<div
								class="avatar initials"
								style="background: color-mix(in srgb, {accentColor} 14%, transparent); color: {accentColor};"
							>
								{initials(review.name)}
							</div>
						{/if}
						<div class="who">
							<div class="name" style="color: {headingColor};">{review.name}</div>
							{#if review.detail}
								<div class="detail" style="color: {textColor};">{review.detail}</div>
							{/if}
						</div>
					</footer>
				</article>
			{/each}
		</div>

		{#if footnote}
			<p class="footnote" style="color: {textColor};">{footnote}</p>
		{/if}
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
		padding: calc(64px * var(--padding-scale, 1)) calc(72px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 48px;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.eyebrow {
		font-size: calc(18px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h2 {
		font-size: calc(54px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, center);
		margin: 0;
	}

	.cards {
		display: flex;
		align-items: stretch;
		justify-content: center;
		gap: 32px;
	}

	.card {
		flex: 1;
		max-width: 400px;
		background: #ffffff;
		border-radius: 24px;
		padding: 36px 34px;
		display: flex;
		flex-direction: column;
		gap: 22px;
		box-shadow: 0 22px 44px -32px rgba(15, 23, 42, 0.55);
		animation: card-rise 0.55s ease-out backwards;
	}

	.stars {
		display: flex;
		gap: 4px;
	}

	.stars svg {
		width: 26px;
		height: 26px;
	}

	blockquote {
		margin: 0;
		flex: 1;
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: var(--font-weight, 500);
		line-height: var(--line-height, 1.55);
		letter-spacing: var(--letter-spacing, normal);
	}

	.mark {
		font-size: calc(30px * var(--font-scale, 1));
		font-weight: 800;
		line-height: 0;
		margin-right: 2px;
	}

	footer {
		display: flex;
		align-items: center;
		gap: 14px;
		border-top: 1px solid #eef2f7;
		padding-top: 20px;
	}

	.avatar {
		width: 54px;
		height: 54px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.avatar.initials {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: calc(20px * var(--font-scale, 1));
		font-weight: 700;
	}

	.name {
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: 700;
		line-height: 1.2;
	}

	.detail {
		font-size: calc(17px * var(--font-scale, 1));
		line-height: 1.3;
		margin-top: 2px;
	}

	.footnote {
		font-size: calc(18px * var(--font-scale, 1));
		text-align: center;
		margin: 0;
		opacity: 0.72;
	}

	@keyframes card-rise {
		from {
			opacity: 0;
			transform: translateY(24px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media print {
		.card {
			animation: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			animation: none;
		}
	}
</style>
