<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		eyebrow,
		heading,
		subheading,
		items,
		image,
		footnote,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		eyebrow: text.eyebrow,
		heading: text.heading,
		subheading: text.subheading,
		items: text.items,
		image: images.image,
		footnote: text.footnote,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	let parsedItems = $derived(
		items
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
	);

	/**
	 * With a photo alongside, the list stays in one column; on its own it
	 * splits into two, with the extra item landing in the left column.
	 */
	let columns = $derived.by(() => {
		if (image) return [parsedItems];
		const split = Math.ceil(parsedItems.length / 2);
		const left = parsedItems.slice(0, split);
		const right = parsedItems.slice(split);
		return right.length ? [left, right] : [left];
	});
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap" class:with-image={!!image}>
		<div class="content">
			<div class="head">
				{#if eyebrow}
					<div class="eyebrow" style="color: {accentColor};">{eyebrow}</div>
				{/if}
				<h2 style="color: {headingColor};">{heading}</h2>
				{#if subheading}
					<p class="sub" style="color: {textColor};">{subheading}</p>
				{/if}
			</div>

			<div class="columns">
				{#each columns as column, c (c)}
					<ul>
						{#each column as item, i (i)}
							<li style="animation-delay: {0.08 + (c * 6 + i) * 0.07}s;">
								<span
									class="tick"
									style="background: color-mix(in srgb, {accentColor} 12%, transparent); color: {accentColor};"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M20 6 9 17l-5-5" />
									</svg>
								</span>
								<span class="text" style="color: {textColor};">{item}</span>
							</li>
						{/each}
					</ul>
				{/each}
			</div>

			{#if footnote}
				<p class="footnote" style="color: {textColor};">{footnote}</p>
			{/if}
		</div>

		{#if image}
			<div class="figure">
				<img src={image} alt="" />
			</div>
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
		padding: calc(64px * var(--padding-scale, 1)) calc(84px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		gap: 64px;
		align-items: center;
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 44px;
		min-width: 0;
	}

	.head {
		display: flex;
		flex-direction: column;
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
		text-align: var(--text-align, left);
		margin: 0;
	}

	.sub {
		font-size: calc(23px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.45);
		text-align: var(--text-align, left);
		margin: 0;
		max-width: 820px;
	}

	.columns {
		display: flex;
		gap: 56px;
	}

	ul {
		flex: 1;
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
		min-width: 0;
	}

	li {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		animation: item-in 0.45s ease-out backwards;
	}

	.tick {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tick svg {
		width: 20px;
		height: 20px;
	}

	.text {
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: var(--font-weight, 500);
		line-height: var(--line-height, 1.4);
		letter-spacing: var(--letter-spacing, normal);
		padding-top: 4px;
	}

	.figure {
		width: 480px;
		height: 620px;
		flex-shrink: 0;
		border-radius: 28px;
		overflow: hidden;
		box-shadow: 0 30px 60px -40px rgba(15, 23, 42, 0.6);
	}

	.figure img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.footnote {
		font-size: calc(18px * var(--font-scale, 1));
		margin: 0;
		opacity: 0.72;
	}

	@keyframes item-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media print {
		li {
			animation: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		li {
			animation: none;
		}
	}
</style>
