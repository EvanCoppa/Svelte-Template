<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		photo1,
		photo2,
		eyebrow,
		heading,
		body,
		buttonText,
		member1Name,
		member1Bio,
		member1Button,
		member2Name,
		member2Bio,
		member2Button,
		eyebrowColor,
		headingColor,
		bodyColor,
		nameColor,
		buttonColorStart,
		buttonColorEnd,
		circleColor,
		backgroundColor
	} = $derived({
		photo1: images.photo1,
		photo2: images.photo2,
		eyebrow: text.eyebrow,
		heading: text.heading,
		body: text.body,
		buttonText: text.buttonText,
		member1Name: text.member1Name,
		member1Bio: text.member1Bio,
		member1Button: text.member1Button,
		member2Name: text.member2Name,
		member2Bio: text.member2Bio,
		member2Button: text.member2Button,
		eyebrowColor: colors.eyebrowColor,
		headingColor: colors.headingColor,
		bodyColor: colors.bodyColor,
		nameColor: colors.nameColor,
		buttonColorStart: colors.buttonColorStart,
		buttonColorEnd: colors.buttonColorEnd,
		circleColor: colors.circleColor,
		backgroundColor: colors.backgroundColor
	});

	const buttonGradient = $derived(
		`linear-gradient(135deg, ${buttonColorStart} 0%, ${buttonColorEnd} 100%)`
	);
</script>

<section class="slide" style={`background: ${backgroundColor}; ${styleVars}`}>
	<!-- Decorative circle bleeding off the left edge -->
	<div class="circle" style={`background: ${circleColor};`}></div>

	<!-- Left: intro -->
	<div class="intro">
		{#if eyebrow}
			<p class="eyebrow" style="color: {eyebrowColor};">{eyebrow}</p>
		{/if}
		<h2 style="color: {headingColor};">{heading}</h2>
		{#if body}
			<p class="body" style="color: {bodyColor};">{body}</p>
		{/if}
		{#if buttonText}
			<span class="btn" style={`background: ${buttonGradient};`}>{buttonText}</span>
		{/if}
	</div>

	<!-- Middle: portraits -->
	<div class="photo photo1" class:placeholder={!photo1}>
		{#if photo1}<img src={photo1} alt="" />{/if}
	</div>
	<div class="photo photo2" class:placeholder={!photo2}>
		{#if photo2}<img src={photo2} alt="" />{/if}
	</div>

	<!-- Right: member cards -->
	<div class="member member1">
		<h3 style="color: {nameColor};">{member1Name}</h3>
		{#if member1Bio}
			<p class="bio" style="color: {bodyColor};">{member1Bio}</p>
		{/if}
		{#if member1Button}
			<span class="btn btn-sm" style={`background: ${buttonGradient};`}>{member1Button}</span>
		{/if}
	</div>

	<div class="member member2">
		<h3 style="color: {nameColor};">{member2Name}</h3>
		{#if member2Bio}
			<p class="bio" style="color: {bodyColor};">{member2Bio}</p>
		{/if}
		{#if member2Button}
			<span class="btn btn-sm" style={`background: ${buttonGradient};`}>{member2Button}</span>
		{/if}
	</div>
</section>

<style>
	.slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		font-family: inherit;
	}

	.circle {
		position: absolute;
		left: -230px;
		top: 150px;
		width: 360px;
		height: 360px;
		border-radius: 50%;
		z-index: 0;
	}

	/* Left intro block */
	.intro {
		position: absolute;
		z-index: 2;
		left: 120px;
		top: 265px;
		width: 430px;
		text-align: var(--text-align, left);
	}

	.eyebrow {
		margin: 0 0 14px 0;
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: var(--letter-spacing, 0.02em);
	}

	.intro h2 {
		margin: 0 0 22px 0;
		font-size: calc(48px * var(--font-scale, 1));
		line-height: 1.1;
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
	}

	.body {
		margin: 0;
		font-size: calc(17px * var(--font-scale, 1));
		line-height: var(--line-height, 1.7);
		font-weight: var(--font-weight, 400);
	}

	.intro .btn {
		margin-top: 34px;
	}

	/* Portraits */
	.photo {
		position: absolute;
		z-index: 2;
		width: 255px;
		height: 305px;
		left: 565px;
		overflow: hidden;
		border-radius: 26px;
		box-shadow: 0 26px 50px -18px rgba(15, 40, 70, 0.3);
	}
	.photo1 {
		top: 110px;
	}
	.photo2 {
		top: 445px;
	}
	.photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.photo.placeholder {
		background: repeating-linear-gradient(45deg, #eef2f5, #eef2f5 14px, #f6f8fa 14px, #f6f8fa 28px);
	}

	/* Member cards */
	.member {
		position: absolute;
		z-index: 2;
		left: 890px;
		width: 320px;
	}
	.member1 {
		top: 155px;
	}
	.member2 {
		top: 490px;
	}
	.member h3 {
		margin: 0 0 12px 0;
		font-size: calc(27px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.bio {
		margin: 0;
		font-size: calc(16px * var(--font-scale, 1));
		line-height: 1.5;
		font-weight: 400;
		max-width: 260px;
	}
	.member .btn-sm {
		margin-top: 22px;
	}

	/* Buttons */
	.btn {
		display: inline-block;
		padding: 15px 40px;
		border-radius: 9999px;
		color: #ffffff;
		font-size: calc(16px * var(--font-scale, 1));
		font-weight: 600;
		letter-spacing: 0.04em;
		box-shadow: 0 16px 30px -12px rgba(37, 99, 235, 0.5);
	}
	.btn-sm {
		padding: 11px 30px;
		font-size: calc(14px * var(--font-scale, 1));
	}
</style>
