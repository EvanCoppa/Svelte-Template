<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		eyebrow,
		heading,
		patientName,
		doctorName,
		visitDate,
		intro,
		steps,
		contact,
		closingNote,
		logo,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		eyebrow: text.eyebrow,
		heading: text.heading,
		patientName: text.patientName,
		doctorName: text.doctorName,
		visitDate: text.visitDate,
		intro: text.intro,
		steps: text.steps,
		contact: text.contact,
		closingNote: text.closingNote,
		logo: images.logo,
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
				const [title, detail] = line.split('|').map((s) => s.trim());
				return { title: title ?? '', detail: detail ?? '' };
			})
	);

	let parsedContact = $derived(
		contact
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [label, value] = line.split('|').map((s) => s.trim());
				return { label: label ?? '', value: value ?? '' };
			})
	);

	/** The greeting only appears once a real name has been resolved. */
	let greeting = $derived(patientName ? `${patientName}, ` : '');
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="main">
			<div class="eyebrow" style="color: {accentColor};">
				<span class="tick" style="background: {accentColor};"></span>
				{eyebrow}
			</div>

			<h2 style="color: {headingColor};">
				{#if greeting}<span class="greeting" style="color: {accentColor};">{greeting}</span
					>{/if}{heading}
			</h2>

			{#if intro}
				<p class="intro" style="color: {textColor};">{intro}</p>
			{/if}

			<ol class="steps">
				{#each parsedSteps as step, i (i)}
					<li style="animation-delay: {0.12 + i * 0.1}s;">
						<span
							class="num"
							style="background: color-mix(in srgb, {accentColor} 12%, transparent); color: {accentColor};"
						>
							{i + 1}
						</span>
						<span class="copy">
							<span class="title" style="color: {headingColor};">{step.title}</span>
							{#if step.detail}
								<span class="detail" style="color: {textColor};">{step.detail}</span>
							{/if}
						</span>
					</li>
				{/each}
			</ol>
		</div>

		<aside class="card" style="border-color: color-mix(in srgb, {accentColor} 24%, #e2e8f0);">
			{#if logo}
				<img class="logo" src={logo} alt="" />
			{/if}

			{#if doctorName || visitDate}
				<div class="meta">
					{#if doctorName}
						<div class="meta-row">
							<span class="meta-label" style="color: {accentColor};">Your Provider</span>
							<span class="meta-value" style="color: {headingColor};">{doctorName}</span>
						</div>
					{/if}
					{#if visitDate}
						<div class="meta-row">
							<span class="meta-label" style="color: {accentColor};">Visit Date</span>
							<span class="meta-value" style="color: {headingColor};">{visitDate}</span>
						</div>
					{/if}
				</div>
			{/if}

			{#if parsedContact.length}
				<div class="contact">
					{#each parsedContact as item, i (i)}
						<div class="contact-row">
							<span class="contact-label" style="color: {textColor};">{item.label}</span>
							<span class="contact-value" style="color: {headingColor};">{item.value}</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if closingNote}
				<p
					class="note"
					style="color: {textColor}; border-color: color-mix(in srgb, {accentColor} 24%, #e2e8f0);"
				>
					{closingNote}
				</p>
			{/if}
		</aside>
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
		display: grid;
		grid-template-columns: 1fr 400px;
		gap: 64px;
		align-items: start;
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: calc(17px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.tick {
		width: 34px;
		height: 4px;
		border-radius: 2px;
	}

	h2 {
		font-size: calc(50px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		line-height: 1.12;
		text-align: var(--text-align, left);
		margin: 0;
	}

	.greeting {
		white-space: nowrap;
	}

	.intro {
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.5);
		letter-spacing: var(--letter-spacing, normal);
		margin: 0;
		max-width: 760px;
	}

	.steps {
		list-style: none;
		margin: 12px 0 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.steps li {
		display: flex;
		align-items: flex-start;
		gap: 20px;
		animation: step-in 0.5s ease-out backwards;
	}

	.num {
		flex-shrink: 0;
		width: 46px;
		height: 46px;
		border-radius: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: 800;
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 4px;
	}

	.title {
		font-size: calc(25px * var(--font-scale, 1));
		font-weight: var(--font-weight, 600);
		line-height: 1.25;
		letter-spacing: var(--letter-spacing, normal);
	}

	.detail {
		font-size: calc(19px * var(--font-scale, 1));
		line-height: var(--line-height, 1.45);
	}

	.card {
		border: 2px solid #e2e8f0;
		border-radius: 24px;
		padding: 34px 32px;
		display: flex;
		flex-direction: column;
		gap: 26px;
		background: #ffffff;
	}

	.logo {
		height: 56px;
		width: auto;
		max-width: 200px;
		object-fit: contain;
		object-position: left center;
	}

	.meta,
	.contact {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.meta-label,
	.contact-label {
		display: block;
		font-size: calc(14px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin-bottom: 4px;
	}

	.contact-label {
		opacity: 0.7;
		letter-spacing: 0.08em;
	}

	.meta-value {
		display: block;
		font-size: calc(26px * var(--font-scale, 1));
		font-weight: 700;
		line-height: 1.2;
	}

	.contact-value {
		display: block;
		font-size: calc(21px * var(--font-scale, 1));
		font-weight: 600;
		line-height: 1.3;
		word-break: break-word;
	}

	.note {
		border-top: 2px solid #e2e8f0;
		padding-top: 20px;
		margin: 0;
		font-size: calc(18px * var(--font-scale, 1));
		line-height: var(--line-height, 1.5);
		font-style: italic;
	}

	@keyframes step-in {
		from {
			opacity: 0;
			transform: translateX(-14px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	@media print {
		.steps li {
			animation: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.steps li {
			animation: none;
		}
	}
</style>
