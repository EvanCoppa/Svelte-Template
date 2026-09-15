<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { recordHref } from '$lib/crm/records';
	import { expandDeck, slideProps } from '$lib/slides/present';
	import { SLIDE_HEIGHT, SLIDE_WIDTH } from '$lib/slides/theme';

	/**
	 * The slideshow. The deck expands over the proposal (one option slide per
	 * option, bound slots filled), and one slide at a time is drawn at its
	 * real 1400×850 and scaled to the viewport. ← → Home End move, C toggles
	 * the chrome, clicking the stage does too; print shows every slide, one
	 * per page.
	 */
	let { data } = $props();

	// The viewer is dark by design, whatever the app theme, so its buttons wear its ink.
	const pill =
		'rounded-full border-slate-400/25 bg-slate-900/55 text-slate-200 hover:bg-slate-900/80 hover:text-slate-100';

	const slides = $derived(expandDeck(data.deck, data.presentation));
	let index = $state(0);
	let chrome = $state(true);
	let viewport = $state({ width: 0, height: 0 });

	const current = $derived(slides[Math.min(index, Math.max(slides.length - 1, 0))] ?? null);
	const scale = $derived.by(() => {
		const pad = chrome ? 120 : 32;
		const width = Math.max(320, viewport.width - pad);
		const height = Math.max(240, viewport.height - pad);
		return Math.min(1, width / SLIDE_WIDTH, height / SLIDE_HEIGHT);
	});

	function go(next: number) {
		index = slides.length ? Math.max(0, Math.min(slides.length - 1, next)) : 0;
	}

	function onkeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowLeft':
			case 'PageUp':
				go(index - 1);
				break;
			case 'ArrowRight':
			case 'PageDown':
			case ' ':
				go(index + 1);
				break;
			case 'Home':
				go(0);
				break;
			case 'End':
				go(slides.length - 1);
				break;
			case 'c':
			case 'C':
				chrome = !chrome;
				break;
			default:
				return;
		}
		event.preventDefault();
	}
</script>

<svelte:window {onkeydown} bind:innerWidth={viewport.width} bind:innerHeight={viewport.height} />

<div class="viewer" class:chrome>
	<header class="bar">
		<div class="side">
			<span class="name">{data.presentation.proposal.title}</span>
			<span class="meta">Slide {slides.length ? index + 1 : 0} / {slides.length}</span>
		</div>
		<div class="side">
			<Button
				variant="outline"
				class={pill}
				href={recordHref('proposal', data.presentation.proposal.id)}
			>
				Exit
			</Button>
			<Button variant="outline" class={pill} onclick={() => (chrome = !chrome)}>
				Chrome: {chrome ? 'On' : 'Off'} (C)
			</Button>
		</div>
	</header>

	<main class="stage">
		{#if current}
			<section class="slide" style="transform: scale({scale});">
				<current.template.Component {...slideProps(current, data.presentation)} />
			</section>
		{:else}
			<p class="empty">This deck has no slides to show.</p>
		{/if}
	</main>

	<footer class="bar">
		<div class="side">
			<Button variant="outline" class={pill} onclick={() => go(index - 1)} disabled={index <= 0}>
				Prev (←)
			</Button>
			<Button
				variant="outline"
				class={pill}
				onclick={() => go(index + 1)}
				disabled={index >= slides.length - 1}
			>
				Next (→)
			</Button>
		</div>
		<div class="side">
			<Button variant="outline" class={pill} onclick={() => window.print()}>Print</Button>
		</div>
	</footer>

	<!-- Every slide, for print only. -->
	<div class="print-run">
		{#each slides as shown (shown.key)}
			<section class="print-slide">
				<shown.template.Component {...slideProps(shown, data.presentation)} />
			</section>
		{/each}
	</div>
</div>

<style>
	.viewer {
		height: 100vh;
		display: grid;
		grid-template-rows: auto 1fr auto;
		color: #e2e8f0;
		background:
			radial-gradient(1200px 700px at 20% 10%, rgba(56, 189, 248, 0.16), rgba(2, 6, 23, 0)),
			radial-gradient(900px 600px at 80% 70%, rgba(34, 211, 238, 0.1), rgba(2, 6, 23, 0)),
			linear-gradient(180deg, #0f172a, #020617);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		background: rgba(2, 6, 23, 0.65);
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
		backdrop-filter: blur(10px);
	}
	footer.bar {
		border-top: 1px solid rgba(148, 163, 184, 0.18);
		border-bottom: none;
	}
	.viewer:not(.chrome) .bar {
		display: none;
	}
	.side {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.name {
		font-weight: 700;
		letter-spacing: 0.01em;
	}
	.meta {
		font-size: 12px;
		color: rgba(226, 232, 240, 0.72);
	}
	.stage {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 28px;
		overflow: hidden;
		min-height: 0;
	}
	.slide {
		width: 1400px;
		height: 850px;
		flex: none;
		transform-origin: center center;
		background: white;
		border-radius: 10px;
		overflow: hidden;
		box-shadow:
			0 40px 80px rgba(0, 0, 0, 0.35),
			0 2px 0 rgba(255, 255, 255, 0.08) inset;
	}
	.empty {
		font-size: 16px;
		color: rgba(226, 232, 240, 0.72);
	}
	.print-run {
		display: none;
	}
	@media print {
		.viewer {
			height: auto;
			display: block;
			background: none;
		}
		.bar,
		.stage {
			display: none;
		}
		.print-run {
			display: block;
		}
		.print-slide {
			width: 1400px;
			height: 850px;
			overflow: hidden;
			page-break-after: always;
		}
		@page {
			size: 1400px 850px;
			margin: 0;
		}
	}
</style>
