<script lang="ts">
	import { pairs } from '../present';
	import { qrDrawing } from '../qr';
	import type { SlideProps } from '../types';

	/**
	 * The closing "aftercare & next steps" slide. Yes Smile filled the items
	 * from its AI education cache at present time; here they are typed on the
	 * slide, one "title | note" per line, and the QR code is drawn from the
	 * schedule URL (hidden while it is blank).
	 */
	let { text, colors }: SlideProps = $props();
	const { primaryColor, accentColor, heading, message, scheduleUrl, scheduleLabel } = $derived({
		primaryColor: colors.primaryColor,
		accentColor: colors.accentColor,
		heading: text.heading,
		message: text.message,
		scheduleUrl: text.scheduleUrl,
		scheduleLabel: text.scheduleLabel
	});

	// Show at most this many aftercare entries so the slide never overflows.
	const MAX_ITEMS = 5;

	const items = $derived(
		pairs(text.items).map(({ left, right }) => ({ title: left, aftercare: right }))
	);
	const visibleItems = $derived(items.slice(0, MAX_ITEMS));
	const overflowCount = $derived(Math.max(0, items.length - MAX_ITEMS));
	const qr = $derived(qrDrawing(scheduleUrl));
</script>

<section class="slide" style="--primary: {primaryColor}; --accent: {accentColor}">
	<div class="layout">
		<div class="left">
			<span class="tag">Aftercare &amp; Next Steps</span>
			<h1>{heading}</h1>
			<p class="intro">{message}</p>
			{#if qr}
				<div class="qr-card">
					<svg
						class="qr"
						viewBox="0 0 {qr.dim} {qr.dim}"
						shape-rendering="geometricPrecision"
						role="img"
						aria-label="QR code for {scheduleUrl}"
					>
						<rect width={qr.dim} height={qr.dim} fill="#ffffff" />
						<g fill="#0b1220">
							<path d={qr.dots} />
							<path d={qr.eyes} fill-rule="evenodd" />
						</g>
					</svg>
					<p class="qr-label">{scheduleLabel}</p>
				</div>
			{/if}
		</div>
		<div class="right">
			<h2>Caring for Your Smile at Home</h2>
			<ul>
				{#each visibleItems as item, i (i)}
					<li>
						<div class="icon">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								><path
									d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
								/></svg
							>
						</div>
						<div class="item-text">
							<strong>{item.title}</strong>
							<p>{item.aftercare}</p>
						</div>
					</li>
				{/each}
			</ul>
			{#if overflowCount > 0}
				<p class="more">
					+ {overflowCount} more — we'll send your full aftercare guide home with you
				</p>
			{/if}
		</div>
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		background: #ffffff;
		box-sizing: border-box;
		page-break-after: always;
	}

	.layout {
		display: grid;
		grid-template-columns: 1fr 1.1fr;
		height: 100%;
	}

	.left {
		padding: 80px 72px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 28px;
		background: #ffffff;
	}

	.tag {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--accent);
		text-transform: uppercase;
	}

	h1 {
		font-size: 68px;
		font-weight: 800;
		line-height: 1;
		letter-spacing: -0.03em;
		color: var(--primary);
		margin: 0;
	}

	.intro {
		font-size: 23px;
		line-height: 1.5;
		color: #374151;
		font-weight: 400;
		margin: 0;
		max-width: 460px;
	}

	.qr-card {
		display: flex;
		align-items: center;
		gap: 24px;
		margin-top: 12px;
		padding: 22px 26px;
		border-radius: 18px;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		width: fit-content;
		max-width: 480px;
		box-shadow: 0 12px 32px rgba(2, 6, 23, 0.1);
	}

	.qr {
		display: block;
		width: 150px;
		height: 150px;
	}

	.qr-label {
		font-size: 20px;
		font-weight: 600;
		line-height: 1.35;
		color: var(--primary);
		margin: 0;
		max-width: 220px;
	}

	.right {
		padding: 72px 76px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 28px;
		background: #f8fafc;
		border-left: 1px solid #e2e8f0;
	}

	h2 {
		font-size: 20px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--accent);
		margin: 0;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	li {
		display: flex;
		gap: 20px;
		align-items: flex-start;
	}

	.icon {
		width: 46px;
		height: 46px;
		border-radius: 13px;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent);
		flex-shrink: 0;
	}

	.item-text strong {
		display: block;
		font-size: 21px;
		font-weight: 600;
		color: var(--primary);
		margin-bottom: 4px;
	}

	.item-text p {
		font-size: 19px;
		line-height: 1.45;
		color: #374151;
		margin: 0;
	}

	.more {
		font-size: 17px;
		color: #64748b;
		font-style: italic;
		margin: 0;
	}
</style>
