<script lang="ts">
	import { pairs } from '../present';
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars, presentation }: SlideProps = $props();

	const steps = $derived(pairs(text.steps));
	const contact = $derived(pairs(text.contact));
</script>

<section
	class="slide"
	style="background: {colors.backgroundColor}; color: {colors.textColor}; --accent: {colors.accentColor}; {styleVars}"
>
	<div class="main">
		<p class="eyebrow" style="color: {colors.accentColor};">
			<span class="tick" style="background: {colors.accentColor};"></span>
			{text.eyebrow}
		</p>
		<h2 style="color: {colors.headingColor};">
			{#if presentation.client}<span style="color: {colors.accentColor};"
					>{presentation.client.name},
				</span>{/if}{text.heading}
		</h2>
		{#if text.intro}<p class="intro">{text.intro}</p>{/if}
		<ol>
			{#each steps as step, i (i)}
				<li>
					<span class="num" style="color: {colors.accentColor};">{i + 1}</span>
					<div>
						<strong style="color: {colors.headingColor};">{step.left}</strong>
						{#if step.right}<span class="detail">{step.right}</span>{/if}
					</div>
				</li>
			{/each}
		</ol>
	</div>

	<aside class="card">
		{#if images.logo}<img class="logo" src={images.logo} alt="" />{/if}
		{#if presentation.responsible}
			<div class="row">
				<span class="label">{presentation.labels.responsible}</span>
				<span class="value" style="color: {colors.headingColor};"
					>{presentation.responsible.name}</span
				>
			</div>
		{/if}
		{#if presentation.presenter}
			<div class="row">
				<span class="label">{presentation.labels.presenter}</span>
				<span class="value" style="color: {colors.headingColor};"
					>{presentation.presenter.name}</span
				>
			</div>
		{/if}
		<div class="row">
			<span class="label">Date</span>
			<span class="value" style="color: {colors.headingColor};">{presentation.proposal.date}</span>
		</div>
		{#each contact as line, i (i)}
			<div class="row">
				<span class="label">{line.left}</span>
				<span class="value" style="color: {colors.headingColor};">{line.right}</span>
			</div>
		{/each}
		{#if text.closingNote}<p class="note">{text.closingNote}</p>{/if}
	</aside>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		display: grid;
		grid-template-columns: 1fr 400px;
		gap: 64px;
		align-items: start;
		padding: calc(64px * var(--padding-scale, 1)) calc(80px * var(--padding-scale, 1));
		box-sizing: border-box;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.eyebrow {
		margin: 0 0 14px;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: calc(17px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.tick {
		width: 34px;
		height: 4px;
		border-radius: 2px;
	}
	h2 {
		margin: 0 0 18px;
		font-size: calc(50px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		line-height: 1.08;
	}
	.intro {
		margin: 0 0 26px;
		font-size: calc(22px * var(--font-scale, 1));
		line-height: var(--line-height, 1.45);
		opacity: 0.85;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	li {
		display: flex;
		gap: 22px;
		align-items: flex-start;
		font-size: calc(22px * var(--font-scale, 1));
		line-height: var(--line-height, 1.35);
	}
	.num {
		flex: none;
		width: 46px;
		height: 46px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		font-weight: 700;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	li strong {
		display: block;
		font-weight: 700;
	}
	.detail {
		opacity: 0.8;
	}
	.card {
		background: #fff;
		border: 2px solid color-mix(in srgb, var(--accent) 24%, #e2e8f0);
		border-radius: 24px;
		padding: 34px 32px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.logo {
		height: 56px;
		width: auto;
		object-fit: contain;
		align-self: flex-start;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.label {
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.value {
		font-size: 20px;
		font-weight: 600;
	}
	.note {
		margin: 8px 0 0;
		padding-top: 16px;
		border-top: 2px solid #e2e8f0;
		font-style: italic;
		font-size: 17px;
		opacity: 0.8;
	}
</style>
