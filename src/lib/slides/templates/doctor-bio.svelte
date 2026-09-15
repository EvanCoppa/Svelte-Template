<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		eyebrow,
		doctorName,
		jobTitle,
		bio,
		credentials,
		badges,
		yearsExperience,
		yearsLabel,
		headshotUrl,
		logoUrl,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		eyebrow: text.eyebrow,
		doctorName: text.doctorName,
		jobTitle: text.jobTitle,
		bio: text.bio,
		credentials: text.credentials,
		badges: text.badges,
		yearsExperience: text.yearsExperience,
		yearsLabel: text.yearsLabel,
		headshotUrl: images.headshot,
		logoUrl: images.logo,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	let credentialList = $derived(
		credentials
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)
	);
	let badgeList = $derived(
		badges
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)
	);
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="left">
			<div class="photo-stack">
				<div class="photo-frame" style="border-color: {accentColor};"></div>
				{#if headshotUrl}
					<img src={headshotUrl} alt={doctorName} class="photo" />
				{:else}
					<div class="photo placeholder">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="64"
							height="64"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg
						>
						<span class="placeholder-text">Headshot</span>
					</div>
				{/if}
				{#if yearsExperience}
					<div class="years" style="background: {accentColor};">
						<span class="years-num">{yearsExperience}</span>
						<span class="years-label">{yearsLabel}</span>
					</div>
				{/if}
			</div>
		</div>

		<div class="right">
			{#if logoUrl}
				<img src={logoUrl} alt="" class="logo" />
			{/if}
			<p class="eyebrow" style="color: {accentColor};">{eyebrow}</p>
			<h2 style="color: {headingColor};">{doctorName}</h2>
			{#if jobTitle}
				<p class="job-title" style="color: {textColor};">{jobTitle}</p>
			{/if}
			{#if bio}
				<p class="bio" style="color: {textColor};">{bio}</p>
			{/if}

			{#if credentialList.length > 0}
				<ul class="credentials">
					{#each credentialList as credential (credential)}
						<li style="color: {textColor};">
							<svg
								class="check"
								xmlns="http://www.w3.org/2000/svg"
								width="22"
								height="22"
								viewBox="0 0 24 24"
								fill="none"
								stroke={accentColor}
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg
							>
							<span>{credential}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if badgeList.length > 0}
				<div class="badges">
					{#each badgeList as badge (badge)}
						<span
							class="badge"
							style="color: {accentColor}; border-color: color-mix(in srgb, {accentColor} 40%, transparent); background: color-mix(in srgb, {accentColor} 8%, transparent);"
						>
							{badge}
						</span>
					{/each}
				</div>
			{/if}
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
		height: 100%;
		padding: calc(72px * var(--padding-scale, 1)) calc(88px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 88px;
	}

	.left {
		flex-shrink: 0;
	}

	.photo-stack {
		position: relative;
		width: 420px;
		height: 540px;
	}

	/* Offset accent outline behind the headshot */
	.photo-frame {
		position: absolute;
		inset: 0;
		transform: translate(20px, 20px);
		border: 3px solid;
		border-radius: 24px;
		opacity: 0.35;
	}

	.photo {
		position: relative;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 24px;
		box-shadow: 0 20px 44px rgba(2, 6, 23, 0.16);
	}

	.photo.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		box-sizing: border-box;
		color: #9ca3af;
		background: #f3f4f6;
		border: 3px dashed #d1d5db;
		box-shadow: none;
	}

	.placeholder-text {
		font-size: 18px;
		font-weight: 500;
	}

	.years {
		position: absolute;
		right: -28px;
		bottom: -28px;
		width: 152px;
		height: 152px;
		border-radius: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		color: #ffffff;
		border: 5px solid #ffffff;
		box-shadow: 0 12px 28px rgba(2, 6, 23, 0.22);
	}

	.years-num {
		font-size: 52px;
		font-weight: 800;
		line-height: 1;
	}

	.years-label {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		text-align: center;
		max-width: 110px;
		line-height: 1.2;
	}

	.right {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 18px;
		position: relative;
	}

	.logo {
		position: absolute;
		top: -24px;
		right: 0;
		height: 72px;
		width: 72px;
		object-fit: contain;
	}

	.eyebrow {
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing, 0.18em);
		margin: 0;
	}

	h2 {
		font-size: calc(64px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, left);
		line-height: 1.05;
		margin: 0;
	}

	.job-title {
		font-size: calc(27px * var(--font-scale, 1));
		font-weight: var(--font-weight, 500);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, left);
		margin: 0;
		opacity: 0.85;
	}

	.bio {
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, normal);
		line-height: var(--line-height, 1.55);
		text-align: var(--text-align, left);
		margin: 0;
		max-width: 720px;
		white-space: pre-line;
	}

	.credentials {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.credentials li {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: var(--font-weight, 500);
		letter-spacing: var(--letter-spacing, normal);
		line-height: var(--line-height, 1.35);
	}

	.check {
		flex-shrink: 0;
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 8px;
	}

	.badge {
		font-size: calc(17px * var(--font-scale, 1));
		font-weight: var(--font-weight, 600);
		letter-spacing: var(--letter-spacing, 0.03em);
		padding: 9px 22px;
		border-radius: 999px;
		border: 1.5px solid #bfdbfe; /* fallback if color-mix is unavailable */
		background: #eff6ff; /* fallback if color-mix is unavailable */
		white-space: nowrap;
	}
</style>
