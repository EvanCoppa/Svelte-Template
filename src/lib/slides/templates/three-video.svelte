<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors }: SlideProps = $props();
	const {
		heading,
		headingColor,
		backgroundColor,
		textColor,
		thumbnails,
		videoUrls,
		links,
		captions
	} = $derived({
		heading: text.heading,
		headingColor: colors.headingColor,
		backgroundColor: colors.backgroundColor,
		textColor: colors.textColor,
		thumbnails: [images.video1Poster, images.video2Poster, images.video3Poster],
		videoUrls: [images.video1, images.video2, images.video3],
		links: [text.link1, text.link2, text.link3],
		captions: [text.caption1, text.caption2, text.caption3]
	});

	let hoveredIndex = $state<number | null>(null);
	let videoEls = $state<(HTMLVideoElement | undefined)[]>([]);

	function handleMouseEnter(i: number) {
		hoveredIndex = i;
		const el = videoEls[i];
		if (el && videoUrls[i]) void el.play();
	}

	function handleMouseLeave(i: number) {
		hoveredIndex = null;
		const el = videoEls[i];
		if (el) {
			el.pause();
			el.currentTime = 0;
		}
	}
</script>

<section class="slide" style="background-color: {backgroundColor};">
	{#if heading}
		<h2 style="color: {headingColor};">{heading}</h2>
	{/if}

	<div class="grid" class:no-heading={!heading}>
		{#each [0, 1, 2] as i (i)}
			<div class="col">
				<a
					href={links[i] || '#'}
					target="_blank"
					rel="noreferrer"
					class="video-link"
					onmouseenter={() => handleMouseEnter(i)}
					onmouseleave={() => handleMouseLeave(i)}
				>
					<div class="video-container">
						{#if videoUrls[i]}
							<video
								bind:this={videoEls[i]}
								src={videoUrls[i]}
								poster={thumbnails[i] || undefined}
								preload="none"
								muted
								loop
								playsinline
								class="video"
							></video>
						{:else if thumbnails[i]}
							<img class="video" src={thumbnails[i]} alt={captions[i] || ''} />
						{:else}
							<div class="video placeholder">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="48"
									height="48"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polygon points="5 3 19 12 5 21 5 3" />
								</svg>
							</div>
						{/if}

						{#if hoveredIndex !== i && videoUrls[i]}
							<div class="play-icon">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="40"
									height="40"
									viewBox="0 0 24 24"
									fill="white"
								>
									<polygon points="5 3 19 12 5 21 5 3" />
								</svg>
							</div>
						{/if}
					</div>
				</a>

				{#if captions[i]}
					<p class="caption" style="color: {textColor};">
						{captions[i]}
					</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
		display: flex;
		flex-direction: column;
	}

	h2 {
		font-size: 56px;
		font-weight: 800;
		margin: 0;
		padding: 40px 48px 0;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 28px;
		padding: 24px 48px 40px;
		box-sizing: border-box;
		flex: 1;
	}

	.grid.no-heading {
		padding-top: 48px;
	}

	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.video-link {
		text-decoration: none;
		display: block;
	}

	.video-container {
		position: relative;
		border-radius: 16px;
		overflow: hidden;
	}

	.video {
		width: 400px;
		height: 680px;
		object-fit: cover;
		display: block;
		border-radius: 16px;
	}

	.video.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
	}

	.play-icon {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.caption {
		margin: 12px 0 0;
		font-size: 20px;
		font-weight: 600;
		text-align: center;
	}

	@media print {
		video {
			display: none;
		}
	}
</style>
