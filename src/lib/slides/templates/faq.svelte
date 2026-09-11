<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		subheading,
		backgroundColor,
		cardBackgroundColor,
		headingColor,
		textColor,
		accentColor,
		questions,
		answers
	} = $derived({
		heading: text.heading,
		subheading: text.subheading,
		backgroundColor: colors.backgroundColor,
		cardBackgroundColor: colors.cardBackgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor,
		questions: [text.question1, text.question2, text.question3, text.question4],
		answers: [text.answer1, text.answer2, text.answer3, text.answer4]
	});

	let pairs = $derived(
		questions
			.map((question, i) => ({
				question: (question ?? '').trim(),
				answer: (answers[i] ?? '').trim()
			}))
			.filter((pair) => pair.question)
	);
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if subheading}
				<p class="sub" style="color: {textColor};">{subheading}</p>
			{/if}
		</div>

		<div class="grid" class:two-up={pairs.length <= 2}>
			{#each pairs as pair, i (i)}
				<div class="card" style="background: {cardBackgroundColor};">
					<div class="q-row">
						<div
							class="q-mark"
							style="color: {accentColor}; background: color-mix(in srgb, {accentColor} 10%, transparent);"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="26"
								height="26"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								><circle cx="12" cy="12" r="10" /><path
									d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
								/><path d="M12 17h.01" /></svg
							>
						</div>
						<h3 style="color: {headingColor};">{pair.question}</h3>
					</div>
					{#if pair.answer}
						<p class="answer" style="color: {textColor};">{pair.answer}</p>
					{/if}
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
		padding: calc(56px * var(--padding-scale, 1)) calc(80px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 44px;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}

	h2 {
		font-size: calc(52px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, center);
		margin: 0;
	}

	.sub {
		font-size: calc(23px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, normal);
		line-height: var(--line-height, 1.4);
		text-align: var(--text-align, center);
		margin: 0;
		max-width: 900px;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 28px;
		align-content: start;
	}

	/* With one or two questions, a single row of wider cards reads better. */
	.grid.two-up {
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
	}

	.card {
		border-radius: 18px;
		padding: calc(30px * var(--padding-scale, 1)) calc(34px * var(--padding-scale, 1));
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-shadow: 0 6px 18px rgba(2, 6, 23, 0.06);
	}

	.q-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.q-mark {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #eff6ff; /* fallback if color-mix is unavailable */
	}

	h3 {
		font-size: calc(26px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		line-height: 1.2;
		margin: 0;
	}

	.answer {
		font-size: calc(20px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, normal);
		line-height: var(--line-height, 1.5);
		text-align: var(--text-align, left);
		margin: 0;
	}
</style>
