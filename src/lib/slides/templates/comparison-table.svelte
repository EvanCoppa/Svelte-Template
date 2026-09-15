<script lang="ts">
	import type { SlideProps } from '../types';

	let { text, colors, styleVars }: SlideProps = $props();
	const {
		heading,
		subheading,
		table,
		recommendedLabel,
		footnote,
		backgroundColor,
		headingColor,
		textColor,
		accentColor
	} = $derived({
		heading: text.heading,
		subheading: text.subheading,
		table: text.table,
		recommendedLabel: text.recommendedLabel,
		footnote: text.footnote,
		backgroundColor: colors.backgroundColor,
		headingColor: colors.headingColor,
		textColor: colors.textColor,
		accentColor: colors.accentColor
	});

	const YES = new Set(['yes', 'y', 'true', '✓', 'check', 'included']);
	const NO = new Set(['no', 'n', 'false', '✗', 'x', '-', '—']);

	type Cell = { kind: 'yes' | 'no' | 'text'; text: string };

	function toCell(raw: string): Cell {
		const key = raw.trim().toLowerCase();
		if (YES.has(key)) return { kind: 'yes', text: '' };
		if (NO.has(key)) return { kind: 'no', text: '' };
		return { kind: 'text', text: raw.trim() };
	}

	let lines = $derived(
		table
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
	);

	let header = $derived(
		(lines[0] ?? '').split('|').map((cell) => {
			const label = cell.trim();
			const recommended = label.endsWith('*');
			return {
				label: recommended ? label.slice(0, -1).trim() : label,
				recommended
			};
		})
	);

	let bodyRows = $derived(
		lines.slice(1).map((line) => {
			const cells = line.split('|').map(toCell);
			// Pad short rows so every row keeps the header's column count.
			while (cells.length < header.length) cells.push({ kind: 'text', text: '' });
			return cells.slice(0, header.length);
		})
	);

	/** First column is the feature name and gets extra room; options split the rest. */
	let gridColumns = $derived(header.length > 1 ? `1.5fr repeat(${header.length - 1}, 1fr)` : '1fr');
</script>

<section class="slide" style="background: {backgroundColor}; {styleVars}">
	<div class="wrap">
		<div class="head">
			<h2 style="color: {headingColor};">{heading}</h2>
			{#if subheading}
				<p class="sub" style="color: {textColor};">{subheading}</p>
			{/if}
		</div>

		<div class="table">
			<div class="row header" style="grid-template-columns: {gridColumns};">
				{#each header as cell, c (c)}
					<div
						class="cell head-cell"
						class:first={c === 0}
						class:highlight={cell.recommended}
						style="color: {cell.recommended ? accentColor : headingColor};
                               background: {cell.recommended
							? `color-mix(in srgb, ${accentColor} 10%, transparent)`
							: 'transparent'};"
					>
						{#if cell.recommended}
							<span class="badge" style="background: {accentColor};">
								{recommendedLabel}
							</span>
						{/if}
						<span class="head-text">{cell.label}</span>
					</div>
				{/each}
			</div>

			{#each bodyRows as row, r (r)}
				<div class="row" style="grid-template-columns: {gridColumns};">
					{#each row as cell, c (c)}
						<div
							class="cell"
							class:first={c === 0}
							class:highlight={header[c]?.recommended}
							style="background: {header[c]?.recommended
								? `color-mix(in srgb, ${accentColor} 10%, transparent)`
								: 'transparent'};"
						>
							{#if cell.kind === 'yes'}
								<svg
									class="icon"
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke={accentColor}
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-label="Included"
									role="img"
								>
									<path d="M20 6 9 17l-5-5" />
								</svg>
							{:else if cell.kind === 'no'}
								<svg
									class="icon"
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="#cbd5e1"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-label="Not included"
									role="img"
								>
									<path d="M18 6 6 18" />
									<path d="m6 6 12 12" />
								</svg>
							{:else}
								<span class="text" style="color: {c === 0 ? headingColor : textColor};">
									{cell.text}
								</span>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>

		{#if footnote}
			<p class="footnote" style="color: {textColor};">{footnote}</p>
		{/if}
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
		padding: calc(58px * var(--padding-scale, 1)) calc(80px * var(--padding-scale, 1));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 36px;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	h2 {
		font-size: calc(50px * var(--font-scale, 1));
		font-weight: var(--font-weight, 700);
		letter-spacing: var(--letter-spacing, -0.01em);
		text-align: var(--text-align, left);
		margin: 0;
	}

	.sub {
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: var(--font-weight, 400);
		line-height: var(--line-height, 1.45);
		text-align: var(--text-align, left);
		margin: 0;
		max-width: 960px;
	}

	.table {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: grid;
		align-items: stretch;
		border-bottom: 1px solid #e8edf3;
	}

	.row:last-child {
		border-bottom: none;
	}

	.cell {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px 18px;
		text-align: center;
		min-height: 34px;
	}

	.cell.first {
		justify-content: flex-start;
		text-align: left;
		padding-left: 8px;
	}

	/* Tinting every cell of a column is what makes it read as one block. */
	.cell.highlight:first-of-type {
		border-radius: 0;
	}

	.row.header {
		border-bottom: 2px solid #dbe3ec;
	}

	.head-cell {
		flex-direction: column;
		gap: 8px;
		padding-top: 16px;
		padding-bottom: 20px;
	}

	.row.header .cell.highlight {
		border-radius: 16px 16px 0 0;
	}

	.row:last-child .cell.highlight {
		border-radius: 0 0 16px 16px;
	}

	.head-text {
		font-size: calc(26px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: var(--letter-spacing, normal);
		line-height: 1.2;
	}

	.badge {
		color: #ffffff;
		font-size: calc(12px * var(--font-scale, 1));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 5px 12px;
		border-radius: 999px;
	}

	.text {
		font-size: calc(22px * var(--font-scale, 1));
		font-weight: var(--font-weight, 500);
		line-height: var(--line-height, 1.35);
		letter-spacing: var(--letter-spacing, normal);
	}

	.cell.first .text {
		font-weight: 600;
	}

	.icon {
		width: 30px;
		height: 30px;
	}

	.footnote {
		font-size: calc(17px * var(--font-scale, 1));
		margin: 0;
		opacity: 0.7;
	}
</style>
