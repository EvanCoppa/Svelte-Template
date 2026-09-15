<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors, styleVars }: SlideProps = $props();
	const {
		eyebrow,
		heading,
		backgroundColor,
		headingColor,
		textColor,
		accentColor,
		photos,
		names,
		members
	} = $derived({
		eyebrow: text.eyebrow,
		heading: text.heading,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor,
		photos: [images.photo1, images.photo2, images.photo3],
		names: [text.group1Name, text.group2Name, text.group3Name],
		members: [text.group1Members, text.group2Members, text.group3Members]
	});

	// A group renders as a column when any of its fields is filled in; leaving
	// group 3 completely empty yields the two-column layout.
	let groups = $derived(
		[0, 1, 2]
			.map((i) => ({
				photoUrl: photos[i] ?? '',
				name: (names[i] ?? '').trim(),
				members: (members[i] ?? '').trim()
			}))
			.filter((g) => g.photoUrl || g.name || g.members)
	);
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap" style="--card-w: {groups.length <= 2 ? '380px' : '330px'};">
		<header class="header">
			<p class="eyebrow" style="color: {accentColor};">{eyebrow}</p>
			<h2 style="color: {headingColor};">{heading}</h2>
		</header>

		<div class="groups">
			{#each groups as group, i (i)}
				<div class="group">
					<div class="photo-stack">
						<div class="photo-frame" style="border-color: {accentColor};"></div>
						{#if group.photoUrl}
							<img src={group.photoUrl} alt={group.name || heading} class="photo" />
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
									><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle
										cx="12"
										cy="7"
										r="4"
									/></svg
								>
							</div>
						{/if}
					</div>
					{#if group.name}
						<h3 style="color: {headingColor};">{group.name}</h3>
					{/if}
					{#if group.name && group.members}
						<div class="rule" style="background: {accentColor};"></div>
					{/if}
					{#if group.members}
						<p class="members" style="color: {textColor};">{group.members}</p>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		page-break-after: always;
	}

	.wrap {
		width: 100%;
		height: 100%;
		padding: calc(56px * var(--padding-scale, 1)) calc(88px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.eyebrow {
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing, 0.18em);
		margin: 0;
	}

	h2 {
		font-size: calc(52px * var(--font-scale, 1));
		font-weight: var(--font-weight, 800);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, center);
		line-height: 1.05;
		margin: 0;
	}

	.groups {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 60px;
		margin-top: 44px;
	}

	.group {
		width: var(--card-w, 330px);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.photo-stack {
		position: relative;
		width: 100%;
		height: 430px;
	}

	/* Offset accent outline behind each photo, matching the Doctor Bio slide */
	.photo-frame {
		position: absolute;
		inset: 0;
		transform: translate(14px, 14px);
		border: 3px solid;
		border-radius: 20px;
		opacity: 0.35;
	}

	.photo {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 20px;
		box-shadow: 0 16px 36px rgba(2, 6, 23, 0.16);
	}

	.photo.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 12px, #f1f5f9 12px, #f1f5f9 24px);
		box-shadow: none;
	}

	h3 {
		font-size: calc(27px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, normal);
		text-align: var(--text-align, center);
		line-height: 1.2;
		margin: 30px 0 0;
	}

	.rule {
		width: 48px;
		height: 3px;
		border-radius: 2px;
		margin-top: 12px;
	}

	.members {
		font-size: calc(19px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		letter-spacing: var(--letter-spacing, normal);
		line-height: var(--line-height, 1.5);
		text-align: var(--text-align, center);
		margin: 12px 0 0;
		white-space: pre-line;
	}
</style>
