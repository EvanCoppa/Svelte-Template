<script lang="ts">
	import { SLIDE_THEME } from '../theme';
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars, presentation }: SlideProps = $props();
</script>

<section
	class="slide"
	style="background: linear-gradient(140deg, {colors.backgroundColor}, {SLIDE_THEME.navy}); color: {colors.textColor}; {styleVars}"
>
	{#if images.backgroundImage}
		<img class="bg" src={images.backgroundImage} alt="" />
		<div class="scrim"></div>
	{/if}
	<div class="glow" style="background: {colors.accentColor};"></div>
	<div class="wrap">
		{#if images.logo}
			<img class="logo" src={images.logo} alt="" />
		{/if}
		<p class="eyebrow" style="color: {colors.accentColor};">
			{presentation.org.name} · {presentation.proposal.date}
		</p>
		<h1 style="color: {colors.headingColor};">{text.heading}</h1>
		{#if text.subheading}
			<p class="sub">{text.subheading}</p>
		{/if}
		<div class="people">
			{#if presentation.client}
				<div class="person">
					<span class="label">Prepared for</span>
					<span class="name" style="color: {colors.headingColor};">{presentation.client.name}</span>
				</div>
			{/if}
			{#if presentation.presenter}
				<div class="person">
					<span class="label">{presentation.labels.presenter}</span>
					<span class="name" style="color: {colors.headingColor};">
						{presentation.presenter.name}
					</span>
				</div>
			{/if}
			{#if presentation.responsible}
				<div class="person">
					<span class="label">{presentation.labels.responsible}</span>
					<span class="name" style="color: {colors.headingColor};">
						{presentation.responsible.name}
					</span>
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		display: flex;
		align-items: var(--content-justify, flex-end);
		font-family: ui-sans-serif, system-ui, sans-serif;
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
		background: linear-gradient(140deg, rgba(11, 26, 43, 0.82), rgba(11, 26, 43, 0.92));
	}
	.glow {
		position: absolute;
		top: -260px;
		right: -180px;
		width: 720px;
		height: 720px;
		border-radius: 50%;
		opacity: 0.16;
		filter: blur(40px);
	}
	.wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: calc(72px * var(--padding-scale, 1)) calc(96px * var(--padding-scale, 1));
		max-width: 1100px;
		text-align: var(--text-align, left);
	}
	.logo {
		height: 64px;
		width: auto;
		object-fit: contain;
		align-self: flex-start;
		margin-bottom: 8px;
	}
	.eyebrow {
		margin: 0;
		font-size: calc(18px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		font-size: calc(92px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.02em);
		line-height: 1;
	}
	.sub {
		margin: 0;
		font-size: calc(30px * var(--font-scale, 1));
		font-weight: 300;
		line-height: var(--line-height, 1.3);
	}
	.people {
		display: flex;
		gap: 48px;
		margin-top: 24px;
		padding-top: 24px;
		border-top: 1px solid rgba(255, 255, 255, 0.18);
	}
	.person {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.label {
		font-size: calc(14px * var(--font-scale, 1));
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.8;
	}
	.name {
		font-size: calc(26px * var(--font-scale, 1));
		font-weight: 500;
	}
</style>
