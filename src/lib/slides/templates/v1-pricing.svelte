<script lang="ts">
	import { money, pairs } from '../present';
	import type { SlideProps } from '../types';

	/**
	 * Yes Smile's pricing slide, one per option. The figures come from the
	 * option the presenter hands in: its lines add up to the treatment total,
	 * and the stored `total` (fee override and discounts already applied by
	 * the trigger) is what the client pays — the gap between the two is the
	 * one discount line, where Yes Smile listed insurance, courtesy and case
	 * fee separately. Financing terms, the cash discount, the payment links
	 * and the planner photos are authored on the slide, as before.
	 */
	let { text, images, colors, styleVars, presentation, option }: SlideProps = $props();
	const { headingColor, accentColor, textColor, backgroundColor } = $derived({
		headingColor: colors.headingColor,
		accentColor: colors.accentColor,
		textColor: colors.textColor,
		backgroundColor: colors.backgroundColor
	});

	const shown = $derived(option ?? presentation.options[0] ?? null);
	const index = $derived(shown ? presentation.options.findIndex((o) => o.id === shown.id) : 0);
	const currency = $derived(shown?.currency ?? 'USD');

	const itemsTotal = $derived(shown?.lines.reduce((sum, line) => sum + line.total, 0) ?? 0);
	const finalAmount = $derived(shown?.total ?? 0);
	const discount = $derived(Math.max(0, itemsTotal - finalAmount));

	const showFinancing = $derived(text.showFinancing === 'true');
	const showCashDiscount = $derived(text.showCashDiscount === 'true');
	const showStrikethrough = $derived(text.showDiscountStrikethrough === 'true');
	const showPlanners = $derived(text.showPlanners === 'true');
	const financingMinimum = $derived(Number(text.financingMinimum) || 0);
	const cashDiscountPercent = $derived(Number(text.cashDiscountPercent) || 0);
	const financingTerms = $derived(
		text.financingTerms
			.split(',')
			.map((term) => Number.parseInt(term.trim(), 10))
			.filter((term) => Number.isFinite(term) && term > 0)
	);
	const cashDiscountLabel = $derived(
		text.cashDiscountLabel || `${String(cashDiscountPercent)}% Off Offer`
	);
	const prepayment = $derived(finalAmount * (1 - cashDiscountPercent / 100));
	const savings = $derived(finalAmount * (cashDiscountPercent / 100));

	const paymentLinks = $derived(pairs(text.paymentLinks).filter((link) => link.left && link.right));
	const planners = $derived(
		[
			{ imageUrl: images.planner1, linkUrl: text.plannerUrl1 },
			{ imageUrl: images.planner2, linkUrl: text.plannerUrl2 }
		].filter((planner) => planner.imageUrl || planner.linkUrl)
	);

	function pluralize(word: string, quantity: number): string {
		if (quantity <= 1 || word.endsWith('s')) return word;
		return word + 's';
	}
</script>

<section
	class="pricing-slide"
	style="background-color: {backgroundColor}; color: {textColor}; {styleVars}"
>
	{#if shown}
		<div class="content">
			{#if text.validityText}
				<div class="valid-notice">-{text.validityText}-</div>
			{/if}

			<h2 class="option-heading" style="color: {headingColor};">
				{text.optionPrefix}
				{shown.label || `Option ${String(index + 1)}`}
			</h2>

			<div class="items-list">
				{#each shown.lines as line, i (i)}
					<div class="item">
						{pluralize(line.label, line.quantity)}{line.detail ? ` (${line.detail})` : ''}
						{line.quantity > 1 ? ` x${String(line.quantity)}` : ''}
						{line.total ? ` ${money(line.total, currency)}` : ''}
					</div>
				{/each}
			</div>

			<div class="pricing-breakdown">
				<div class="total-line" style="color: {headingColor};">
					Treatment Total:
					<span class={discount > 0 && showStrikethrough ? 'strikethrough' : 'underline'}>
						{money(itemsTotal, currency)}
					</span>
				</div>

				{#if discount > 0}
					<div class="adjustment" style="color: {accentColor};">
						Discount: - {money(discount, currency)}
					</div>
					<div class="case-fee-total" style="color: {accentColor};">
						Your Price: <span class="underline">{money(finalAmount, currency)}</span>
					</div>
				{/if}
			</div>

			<div class="payment-boxes">
				{#if showFinancing && finalAmount >= financingMinimum && financingTerms.length > 0}
					<div class="payment-box" style="background-color: {accentColor};">
						<div class="box-heading">{text.financingLabel}</div>
						{#each financingTerms as term (term)}
							<div class="box-detail">
								{term} months: {money(finalAmount / term, currency)} per month
							</div>
						{/each}
					</div>
				{/if}
				{#if showCashDiscount}
					<div class="payment-box" style="background-color: {accentColor};">
						<div class="box-heading">{cashDiscountLabel}</div>
						<div class="box-detail">
							Prepayment or Cash Payment: {money(prepayment, currency)}
						</div>
						<div class="box-detail">
							Your Discount Savings: {money(savings, currency)}
						</div>
					</div>
				{/if}
			</div>

			{#if paymentLinks.length > 0}
				<div class="payment-links-row">
					{#each paymentLinks as link (link.right)}
						<a
							href={link.right}
							target="_blank"
							rel="noopener noreferrer"
							class="payment-link"
							style="border-color: {accentColor}; color: {accentColor};"
						>
							{link.left}
						</a>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<p class="empty">This slide repeats once per option; the proposal has none.</p>
	{/if}

	{#if showPlanners && planners.length > 0}
		<div class="profile-photos">
			<div class="planner-bubble">{text.plannerLabel}</div>
			{#each planners as planner, i (i)}
				{#if planner.linkUrl}
					<a
						href={planner.linkUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="profile-photo-link"
					>
						{#if planner.imageUrl}
							<img src={planner.imageUrl} alt="" class="profile-photo" />
						{:else}
							<div class="profile-photo-placeholder"></div>
						{/if}
					</a>
				{:else}
					<div class="profile-photo-link">
						{#if planner.imageUrl}
							<img src={planner.imageUrl} alt="" class="profile-photo" />
						{:else}
							<div class="profile-photo-placeholder"></div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</section>

<style>
	.pricing-slide {
		position: relative;
		width: 1400px;
		height: 850px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	.content {
		width: 65%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.valid-notice {
		color: #6b7280;
		font-size: 18px;
		letter-spacing: 0.15em;
		margin-bottom: 4px;
	}

	.option-heading {
		font-size: calc(26px * var(--font-scale, 1));
		font-weight: 700;
		text-decoration: underline;
		letter-spacing: 0.02em;
		text-align: center;
		margin: 0 0 8px 0;
	}

	.items-list {
		text-align: center;
		margin-bottom: 8px;
	}

	.item {
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: var(--font-weight, 200);
		letter-spacing: var(--letter-spacing, 0.02em);
		line-height: var(--line-height, 1.5);
	}

	.pricing-breakdown {
		text-align: center;
		margin-bottom: 8px;
	}

	.total-line {
		font-size: 28px;
		font-weight: 700;
	}

	.adjustment {
		font-size: 22px;
		font-weight: 600;
		margin-top: 4px;
	}

	.underline {
		text-decoration: underline;
	}

	.strikethrough {
		text-decoration: line-through;
		opacity: 0.6;
	}

	.case-fee-total {
		font-size: 32px;
		font-weight: 800;
		margin-top: 4px;
	}

	.payment-boxes {
		display: flex;
		justify-content: center;
		gap: 0;
		width: 100%;
		margin-top: 8px;
	}

	.payment-boxes:has(.payment-box:only-child) .payment-box {
		max-width: 50%;
		border-radius: 8px;
	}

	.payment-box {
		flex: 1;
		color: white;
		padding: 20px;
		text-align: center;
	}

	.box-heading {
		font-size: 28px;
		font-weight: 900;
		text-decoration: underline;
		margin-bottom: 8px;
	}

	.box-detail {
		font-size: 20px;
		margin-bottom: 4px;
	}

	.payment-links-row {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 16px;
		margin-top: 16px;
		width: 100%;
	}

	.payment-link {
		display: inline-flex;
		align-items: center;
		padding: 10px 24px;
		border: 2px solid;
		border-radius: 8px;
		font-size: 18px;
		font-weight: 600;
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.payment-link:hover {
		opacity: 0.8;
	}

	.empty {
		margin: auto;
		font-size: 24px;
		opacity: 0.6;
	}

	.profile-photos {
		position: absolute;
		bottom: 20px;
		right: 20px;
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.planner-bubble {
		background-color: #ffffff;
		color: #1f2937;
		font-size: 13px;
		font-weight: 600;
		padding: 6px 12px;
		border-radius: 16px;
		white-space: nowrap;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
	}

	.profile-photo-link {
		display: block;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		overflow: hidden;
		transition: opacity 0.15s;
	}

	.profile-photo-link:hover {
		opacity: 0.8;
	}

	.profile-photo {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform: scale(1.35);
	}

	.profile-photo-placeholder {
		width: 100%;
		height: 100%;
		background-color: #d1d5db;
		border-radius: 50%;
	}
</style>
