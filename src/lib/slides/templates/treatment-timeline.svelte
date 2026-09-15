<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		subheading,
		steps,
		currentStep,
		footnote,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		heading: text.heading,
		subheading: text.subheading,
		steps: text.steps,
		currentStep: text.currentStep,
		footnote: text.footnote,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	let parsedSteps = $derived(
		steps
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [title, caption] = line.split('|').map((s) => s.trim());
				return { title: title ?? '', caption: caption ?? '' };
			})
	);

	/** Clamped to the track so a stale value can never point off the rail. */
	let current = $derived(
		Math.max(0, Math.min(parsedSteps.length, Math.floor(Number(currentStep) || 0)))
	);

	/**
	 * The rail spans node centres, not the full slide width, so it never
	 * dangles past the first or last marker. Each step occupies 1/n of the row
	 * and its node sits in the middle of that slot.
	 */
	let railInset = $derived(parsedSteps.length > 0 ? 100 / (parsedSteps.length * 2) : 0);

	/** How far the accent fill runs along that rail — up to the active node. */
	let progressPercent = $derived(
		parsedSteps.length < 2 || current === 0 ? 0 : ((current - 1) / (parsedSteps.length - 1)) * 100
	);

	function stateOf(index: number): 'done' | 'current' | 'todo' {
		if (current === 0) return 'todo';
		if (index + 1 < current) return 'done';
		if (index + 1 === current) return 'current';
		return 'todo';
	}
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if subheading}
				<p class="sub" style="color: {textColor};">{subheading}</p>
			{/if}
		</div>

		<div class="track">
			<div
				class="rail"
				style="left: {railInset}%; right: {railInset}%;
                       background: color-mix(in srgb, {accentColor} 16%, #e2e8f0);"
			></div>
			<div
				class="rail fill"
				style="left: {railInset}%; width: {(progressPercent * (100 - railInset * 2)) / 100}%;
                       background: {accentColor};"
			></div>

			<div class="nodes">
				{#each parsedSteps as step, i (i)}
					{@const state = stateOf(i)}
					<div class="step" style="animation-delay: {0.1 + i * 0.12}s;">
						<div
							class="node {state}"
							style="--accent: {accentColor}; color: {state === 'todo' ? textColor : '#ffffff'};"
						>
							{#if state === 'done'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M20 6 9 17l-5-5" />
								</svg>
							{:else}
								<span class="num">{i + 1}</span>
							{/if}
						</div>

						<!--
                            The badge row is rendered for every step and only
                            filled for the active one, so step titles stay on a
                            shared baseline instead of jogging down by a row.
                        -->
						<div class="badge-slot">
							{#if state === 'current'}
								<div class="badge" style="background: {accentColor};">You are here</div>
							{/if}
						</div>

						<div class="title" style="color: {headingColor};">{step.title}</div>
						{#if step.caption}
							<div class="caption" style="color: {textColor};">{step.caption}</div>
						{/if}
					</div>
				{/each}
			</div>
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
		padding: calc(64px * var(--padding-scale, 1)) calc(80px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 64px;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}

	h2 {
		font-size: calc(54px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, center);
		margin: 0;
	}

	.sub {
		font-size: calc(23px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.45);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, center);
		margin: 0;
		max-width: 900px;
	}

	.track {
		--node-size: 68px;
		--rail-thickness: 6px;
		--track-top: 34px;
		position: relative;
		padding-top: var(--track-top);
	}

	/*
     * Horizontal extent comes from inline `left`/`right`/`width`, derived from
     * the step count. Vertically the rail is pinned to the middle of the node
     * row — the nodes begin below the track's top padding, so the rail's own
     * midline has to clear that padding plus half a node. Deriving it keeps the
     * line through the circles' centres if the node size is ever changed.
     */
	.rail {
		position: absolute;
		top: calc(var(--track-top) + (var(--node-size) - var(--rail-thickness)) / 2);
		height: var(--rail-thickness);
		border-radius: 999px;
	}

	/*
     * The fill grows from 0 so the timeline "draws" itself on entry. Fill mode
     * "backwards" is deliberately avoided here — a static capture (PDF export,
     * screenshot) should show the finished progress, and `to` is the default
     * resting state.
     */
	.rail.fill {
		animation: rail-grow 0.9s cubic-bezier(0.22, 1, 0.36, 1);
		max-width: 100%;
	}

	.nodes {
		position: relative;
		display: flex;
		align-items: flex-start;
	}

	.step {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 12px;
		padding: 0 12px;
		box-sizing: border-box;
		animation: step-rise 0.55s ease-out backwards;
	}

	.node {
		width: var(--node-size);
		height: var(--node-size);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		background: #ffffff;
		border: 6px solid #e2e8f0;
		flex-shrink: 0;
	}

	.node.done,
	.node.current {
		background: var(--accent);
		border-color: var(--accent);
	}

	.node.current {
		box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent) 18%, transparent);
	}

	.num {
		font-size: calc(26px * var(--font-scale, 1));
		font-weight: 700;
		line-height: 1;
	}

	.badge-slot {
		height: 26px;
		display: flex;
		align-items: center;
		margin-top: -4px;
	}

	.badge {
		font-size: calc(13px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #ffffff;
		padding: 5px 12px;
		border-radius: 999px;
	}

	.title {
		font-size: calc(24px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		line-height: 1.25;
		letter-spacing: var(--letter-spacing, normal);
	}

	.caption {
		font-size: calc(18px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.45);
		letter-spacing: var(--letter-spacing, normal);
		max-width: 240px;
	}

	.footnote {
		font-size: calc(18px * var(--font-scale, 1));
		text-align: center;
		margin: 0;
		opacity: 0.75;
	}

	@keyframes rail-grow {
		from {
			width: 0;
		}
	}

	@keyframes step-rise {
		from {
			opacity: 0;
			transform: translateY(18px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media print {
		.step,
		.rail.fill {
			animation: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.step,
		.rail.fill {
			animation: none;
		}
	}
</style>
