<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		eyebrow,
		heading,
		subheading,
		terms,
		finePrint,
		sealTopText,
		sealBottomText,
		logoUrl,
		backgroundColor,
		headingColor,
		textColor,
		accentColor,
		sealColor
	} = $derived({
		eyebrow: text.eyebrow,
		heading: text.heading,
		subheading: text.subheading,
		terms: text.terms,
		finePrint: text.finePrint,
		sealTopText: text.sealTopText,
		sealBottomText: text.sealBottomText,
		logoUrl: images.logo,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor,
		sealColor: colors.sealColor
	});

	// Unique per instance so the seal's SVG textPath ids never collide when
	// the template appears more than once in a deck.
	const uid = $props.id();

	let parsedTerms = $derived(
		terms
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [title, description] = line.split('|').map((s) => s.trim());
				return { title: title ?? '', description: description ?? '' };
			})
	);

	// Scalloped seal edge: small circles evenly placed on a ring.
	const SCALLOPS = Array.from({ length: 20 }, (_, i) => {
		const angle = (i / 20) * Math.PI * 2;
		return {
			x: 120 + Math.cos(angle) * 100,
			y: 120 + Math.sin(angle) * 100
		};
	});
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="left">
			<div
				class="seal-glow"
				style="background: color-mix(in srgb, {accentColor} 7%, transparent);"
			></div>
			<svg class="seal" viewBox="0 0 240 240" role="img" aria-label="Guarantee seal">
				<defs>
					<path id="seal-arc-top-{uid}" d="M 50 120 A 70 70 0 1 1 190 120" fill="none" />
					<path id="seal-arc-bottom-{uid}" d="M 50 120 A 70 70 0 0 0 190 120" fill="none" />
				</defs>

				{#each SCALLOPS as point (point)}
					<circle cx={point.x} cy={point.y} r="13" fill={sealColor} />
				{/each}
				<circle cx="120" cy="120" r="103" fill={sealColor} />
				<circle
					cx="120"
					cy="120"
					r="88"
					fill="none"
					stroke="#ffffff"
					stroke-width="1.5"
					stroke-dasharray="2.5 5"
					opacity="0.65"
				/>

				<text fill="#ffffff" font-size="17" font-weight="700" letter-spacing="4">
					<textPath href="#seal-arc-top-{uid}" startOffset="50%" text-anchor="middle">
						{sealTopText}
					</textPath>
				</text>
				<text fill="#ffffff" font-size="13" font-weight="600" letter-spacing="3" opacity="0.9">
					<textPath href="#seal-arc-bottom-{uid}" startOffset="50%" text-anchor="middle">
						{sealBottomText}
					</textPath>
				</text>

				<!-- Center: tooth with checkmark -->
				<g
					transform="translate(93, 90) scale(2.3)"
					fill="none"
					stroke="#ffffff"
					stroke-width="1.4"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M12 5.5c-1.5-1.7-3-2.5-4.5-2.5C4.5 3 3 5.2 3 7.8c0 4.2 2 6.3 3 12.2.3 1.8 2.5 1.8 3 0 .5-2 .8-4.5 3-4.5s2.5 2.5 3 4.5c.5 1.8 2.7 1.8 3 0 1-5.9 3-8 3-12.2C21 5.2 19.5 3 16.5 3c-1.5 0-3 .8-4.5 2.5Z"
					/>
					<path d="m9 9.5 2 2 4-4" />
				</g>

				<!-- Flanking stars -->
				<path
					d="m54 116 1.9 3.85 4.25.62-3.07 3 .72 4.23L54 125.7l-3.8 2 .72-4.23-3.07-3 4.25-.62Z"
					fill="#ffffff"
					opacity="0.85"
					transform="translate(0, -1)"
				/>
				<path
					d="m186 116 1.9 3.85 4.25.62-3.07 3 .72 4.23-3.8-2-3.8 2 .72-4.23-3.07-3 4.25-.62Z"
					fill="#ffffff"
					opacity="0.85"
					transform="translate(0, -1)"
				/>
			</svg>
			{#if logoUrl}
				<img src={logoUrl} alt="" class="logo" />
			{/if}
		</div>

		<div class="right">
			<p class="eyebrow" style="color: {accentColor};">{eyebrow}</p>
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if subheading}
				<p class="sub" style="color: {textColor};">{subheading}</p>
			{/if}

			{#if parsedTerms.length > 0}
				<ul class="terms">
					{#each parsedTerms as term (term.title)}
						<li>
							<svg
								class="check"
								xmlns="http://www.w3.org/2000/svg"
								width="30"
								height="30"
								viewBox="0 0 24 24"
								fill="none"
								stroke={accentColor}
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg
							>
							<div class="term-body">
								<span class="term-title" style="color: {headingColor};">{term.title}</span>
								{#if term.description}
									<span class="term-desc" style="color: {textColor};">{term.description}</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			{#if finePrint}
				<p class="fine-print">{finePrint}</p>
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
		padding: calc(64px * var(--padding-scale, 1)) calc(88px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 72px;
	}

	.left {
		position: relative;
		width: 460px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 28px;
	}

	.seal-glow {
		position: absolute;
		width: 460px;
		height: 460px;
		border-radius: 50%;
		background: #eff6ff; /* fallback if color-mix is unavailable */
	}

	.seal {
		position: relative;
		width: 400px;
		height: 400px;
		filter: drop-shadow(0 18px 32px rgba(2, 6, 23, 0.22));
	}

	.logo {
		position: relative;
		height: 64px;
		max-width: 260px;
		object-fit: contain;
	}

	.right {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 20px;
	}

	.eyebrow {
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing, 0.18em);
		margin: 0;
	}

	h2 {
		font-size: calc(56px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, left);
		line-height: 1.08;
		margin: 0;
	}

	.sub {
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, normal);
		line-height: var(--line-height, 1.5);
		text-align: var(--text-align, left);
		margin: 0;
		max-width: 720px;
	}

	.terms {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.terms li {
		display: flex;
		align-items: flex-start;
		gap: 16px;
	}

	.check {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.term-body {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.term-title {
		font-size: calc(24px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, normal);
		line-height: 1.25;
	}

	.term-desc {
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, normal);
		line-height: var(--line-height, 1.45);
		max-width: 700px;
	}

	.fine-print {
		font-size: calc(14px * var(--font-scale, 1));
		color: #9ca3af;
		font-style: italic;
		line-height: var(--line-height, 1.4);
		margin: 10px 0 0;
		max-width: 700px;
	}
</style>
