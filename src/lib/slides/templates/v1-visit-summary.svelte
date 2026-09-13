<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, images, colors }: SlideProps = $props();
	const {
		logoUrl,
		patientName,
		visitDate,
		doctorName,
		visitId,
		headingColor,
		cardBackgroundColor,
		labelColor,
		heading
	} = $derived({
		logoUrl: images.logo,
		patientName: text.patientName,
		visitDate: text.visitDate,
		doctorName: text.doctorName,
		visitId: text.visitId,
		headingColor: colors.headingColor,
		cardBackgroundColor: colors.cardBackgroundColor,
		labelColor: colors.labelColor,
		heading: text.heading
	});
	// Patient-facing slide: render nothing (not '--') when the date is missing.
	const formatDate = (val?: string) => val ?? '';
</script>

<section class="slide">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if logoUrl}
				<img src={logoUrl} alt="" class="logo" />
			{/if}
		</div>

		<div class="grid">
			{#if patientName}
				<div class="card" style="background-color: {cardBackgroundColor};">
					<h3 style="color: {labelColor};">Patient Name</h3>
					<p>{patientName}</p>
				</div>
			{/if}

			{#if visitDate}
				<div class="card" style="background-color: {cardBackgroundColor};">
					<h3 style="color: {labelColor};">Visit Date</h3>
					<p>{formatDate(visitDate)}</p>
				</div>
			{/if}

			{#if doctorName}
				<div class="card" style="background-color: {cardBackgroundColor};">
					<h3 style="color: {labelColor};">Attending Doctor</h3>
					<p>{doctorName}</p>
				</div>
			{/if}

			{#if visitId}
				<div class="card" style="background-color: {cardBackgroundColor};">
					<h3 style="color: {labelColor};">Visit ID</h3>
					<p>{visitId}</p>
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
		background: #ffffff;
		display: flex;
	}

	.wrap {
		margin: auto;
		width: 80%;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.head {
		text-align: center;
	}

	h2 {
		font-size: 60px;
		font-weight: 300;
		margin: 0 0 16px 0;
	}

	.logo {
		height: 100px;
		width: 100px;
		object-fit: contain;
		margin: 0 auto;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 32px;
		font-size: 24px;
	}

	.card {
		padding: 24px;
		border-radius: 12px;
	}

	h3 {
		font-size: 24px;
		margin: 0 0 8px 0;
		font-weight: 700;
	}

	p {
		margin: 0;
		color: #1f2937;
	}
</style>
