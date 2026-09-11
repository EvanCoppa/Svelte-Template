<script lang="ts">
	import { money } from '../present';
	import type { SlideProps } from '../types';

	/**
	 * Up to four products from the org's catalog. Yes Smile let the client add
	 * one to the plan from the slide; here a product already on one of the
	 * proposal's options (a line citing it) is badged instead, and the rest
	 * carry the button label as an invitation to ask. The SKUs typed on the
	 * slide pick which products; blank shows the first four active ones.
	 */
	let { text, colors, presentation }: SlideProps = $props();
	const { heading, headingColor, textColor, backgroundColor, accentColor, buttonColor } = $derived({
		heading: text.heading,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		backgroundColor: colors.backgroundColor,
		accentColor: colors.accentColor,
		buttonColor: colors.buttonColor
	});

	const skus = $derived(
		text.skus
			.split('\n')
			.map((line) => line.trim().toLowerCase())
			.filter((line) => line.length > 0)
	);
	const products = $derived(
		(skus.length
			? presentation.products.filter((product) => skus.includes((product.sku ?? '').toLowerCase()))
			: presentation.products
		).slice(0, 4)
	);
	const inPlan = $derived(
		new Set(
			presentation.options.flatMap((option) =>
				option.lines.flatMap((line) => (line.productId ? [line.productId] : []))
			)
		)
	);
</script>

<section class="products-slide" style="background-color: {backgroundColor}; color: {textColor};">
	<h2 class="heading" style="color: {headingColor};">{heading}</h2>

	<div
		class="products-grid"
		class:single={products.length === 1}
		class:double={products.length === 2}
		class:quad={products.length >= 4}
	>
		{#each products as product (product.id)}
			{@const isAdded = inPlan.has(product.id)}
			<div class="product-card">
				<div class="image-container">
					<div class="image-placeholder">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="64"
							height="64"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
							<line x1="3" y1="6" x2="21" y2="6" />
							<path d="M16 10a4 4 0 0 1-8 0" />
						</svg>
					</div>
				</div>

				<div class="product-info">
					<h3 class="product-name" style="color: {headingColor};">{product.name}</h3>

					{#if product.description}
						<p class="product-description">{product.description}</p>
					{/if}

					<div class="price-row">
						<span class="price" style="color: {accentColor};">
							{money(product.price, product.currency)}
						</span>
					</div>

					<div
						class="buy-button"
						class:added={isAdded}
						style="background-color: {isAdded ? '#16a34a' : buttonColor};"
					>
						{isAdded ? text.addedLabel : text.buttonLabel}
					</div>
				</div>
			</div>
		{:else}
			<p class="empty">No active products in the catalog yet.</p>
		{/each}
	</div>
</section>

<style>
	.products-slide {
		width: 1400px;
		height: 850px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		page-break-after: always;
	}

	.heading {
		font-size: 56px;
		font-weight: 800;
		margin: 0 0 40px 0;
		text-align: center;
	}

	.products-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 32px;
		padding: 0 48px;
		width: 100%;
		box-sizing: border-box;
		max-width: 1300px;
	}

	.products-grid.single {
		grid-template-columns: 1fr;
		max-width: 420px;
	}

	.products-grid.double {
		grid-template-columns: repeat(2, 1fr);
		max-width: 860px;
	}

	.products-grid.quad {
		grid-template-columns: repeat(4, 1fr);
		gap: 24px;
		max-width: 1300px;
	}

	.products-grid.quad .image-container {
		height: 200px;
	}

	.products-grid.quad .product-name {
		font-size: 18px;
	}

	.products-grid.quad .product-info {
		padding: 16px;
		gap: 6px;
	}

	.products-grid.quad .price {
		font-size: 22px;
	}

	.products-grid.quad .buy-button {
		font-size: 15px;
		padding: 10px 16px;
	}

	.product-card {
		display: flex;
		flex-direction: column;
		background: #ffffff;
		border-radius: 16px;
		box-shadow:
			0 8px 30px rgba(0, 0, 0, 0.08),
			0 1px 3px rgba(0, 0, 0, 0.06);
		border: 1px solid #e5e7eb;
		overflow: hidden;
		text-align: left;
		color: inherit;
	}

	.image-container {
		width: 100%;
		height: 300px;
		overflow: hidden;
		background: #f3f4f6;
	}

	.image-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #9ca3af;
		background: repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 12px, #f9fafb 12px, #f9fafb 24px);
	}

	.product-info {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}

	.product-name {
		font-size: 24px;
		font-weight: 700;
		margin: 0;
		line-height: 1.2;
	}

	.product-description {
		font-size: 16px;
		line-height: 1.4;
		margin: 0;
		color: #6b7280;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.price-row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-top: auto;
	}

	.price {
		font-size: 28px;
		font-weight: 800;
	}

	.buy-button {
		margin-top: 12px;
		color: #ffffff;
		font-size: 18px;
		font-weight: 700;
		padding: 14px 24px;
		border-radius: 10px;
		text-align: center;
		letter-spacing: 0.02em;
	}

	.empty {
		grid-column: 1 / -1;
		text-align: center;
		font-size: 24px;
		opacity: 0.6;
	}
</style>
