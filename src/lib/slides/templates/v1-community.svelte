<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images: slots, colors }: SlideProps = $props();
	const { heading, headingColor, buttonText, buttonUrl, buttonColor, images, quotes } = $derived({
		heading: text.heading,
		headingColor: colors.headingColor,
		buttonText: text.buttonText,
		buttonUrl: text.buttonUrl,
		buttonColor: colors.buttonColor,
		images: [slots.photo1, slots.photo2, slots.photo3],
		quotes: [text.quote1, text.quote2, text.quote3]
	});
</script>

<section class="slide">
	<div class="top">
		<h2 style="color: {headingColor};">{heading}</h2>
		{#if buttonText && buttonUrl}
			<a
				class="cta"
				href={buttonUrl}
				target="_blank"
				rel="noreferrer"
				style="background-color: {buttonColor};"
			>
				{buttonText}
			</a>
		{/if}
	</div>

	<div class="grid">
		{#each [0, 1, 2] as i (i)}
			<div class="col">
				{#if images[i]}
					<img class="photo" src={images[i]} alt="" />
				{:else}
					<div class="photo placeholder">
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
							><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle
								cx="8.5"
								cy="8.5"
								r="1.5"
							/><polyline points="21 15 16 10 5 21" /></svg
						>
					</div>
				{/if}

				<div class="card">
					<div class="stars" aria-hidden="true">
						{#each { length: 5 }, s (s)}
							<svg viewBox="0 0 24 24" class="star">
								<path
									d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
								/>
							</svg>
						{/each}
					</div>
					<p>{quotes[i] ?? ''}</p>
				</div>
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
		background: #ffffff;
	}

	.top {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 48px 48px 18px;
		box-sizing: border-box;
	}

	h2 {
		font-size: 72px;
		font-weight: 800;
		margin: 0;
	}

	.cta {
		margin-left: auto;
		color: #ffffff;
		text-decoration: none;
		padding: 16px 18px;
		border-radius: 14px;
		font-weight: 700;
		width: 240px;
		height: 64px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 22px;
		padding: 18px 36px 24px;
		box-sizing: border-box;
	}

	.col {
		display: flex;
		flex-direction: column;
	}

	.photo {
		height: 450px;
		width: 350px;
		margin: 0 auto;
		object-fit: cover;
		border-radius: 12px;
	}

	.photo.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
		border-radius: 12px;
	}

	.card {
		width: 350px;
		height: 160px;
		margin: 24px auto 0;
		background: #ffffff;
		border-radius: 14px;
		box-shadow: 0 16px 30px rgba(2, 6, 23, 0.12);
		border: 1px solid #e5e7eb;
		padding: 22px;
		box-sizing: border-box;
		overflow: hidden;
	}

	.stars {
		display: flex;
		gap: 4px;
		margin-bottom: 12px;
	}

	.star {
		width: 22px;
		height: 22px;
		fill: #facc15;
	}

	.card p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: #374151;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
