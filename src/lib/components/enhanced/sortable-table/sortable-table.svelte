<script lang="ts" generics="T">
	import { onDestroy } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** Rows travelling to their new rank, and the follow mark landing. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** The sort arrow flipping and fading between columns. */
	const SMALL = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const LEAVE: [number, number, number, number] = [0.4, 0, 1, 1];
	/** The hairlines duck out fast and come back slowly, so a re-sort reads as one move. */
	const HIDE = { duration: 0.12, ease: LEAVE } as const;
	const SHOW = { duration: 0.25, ease: EASE } as const;
	/** Seconds of stagger per row, so a re-sort ripples rather than snapping. */
	const STEP = 0.018;

	export type SortDirection = 'asc' | 'desc';

	export type SortState = { columnId: string; direction: SortDirection };

	export type SortableColumn<Row> = {
		id: string;
		header: string;
		width?: string;
		align?: 'start' | 'end';
		numeric?: boolean;
		sortable?: boolean;
		value?: (row: Row) => string | number | null | undefined;
		cell?: (row: Row) => string;
	};

	export interface SortableTableProps<Row> extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children'
	> {
		/** The data, in its original order. That order is preserved and stays reachable. */
		rows: Row[];
		/** Column id, header, optional fixed width, alignment, value accessor for sorting and cell text for display. */
		columns: SortableColumn<Row>[];
		/** Stable identity per row — what lets a row keep its element across a reorder. */
		getRowId: (row: Row) => string;
		/** Accessible name for the table. */
		label: string;
		/** Fixed row height in pixels. Rows travel by transform against this, so the table's height never changes. */
		rowHeight?: number;
		/** Caps the body and scrolls inside it. Without it the body is exactly rows.length * rowHeight. */
		maxHeight?: number;
		/** Current sort. Bindable; `null` means original order. */
		sort?: SortState | null;
		/** Initial sort when not bound. */
		defaultSort?: SortState | null;
		/** Fires on every header activation, including the third click that restores the original order. */
		onSortChange?: (next: SortState | null) => void;
		/** Adds a leading follow toggle so one row can be marked and watched across a reorder. */
		markable?: boolean;
		/** Reports the marked row id, or null when it is cleared. */
		onMarkChange?: (id: string | null) => void;
		/** Accessible name for a row's follow button. Falls back to the first column's value. */
		getRowLabel?: (row: Row) => string;
	}

	const SETTLE_MS = 380;
	const STEP_CAP = 8;

	let {
		class: className,
		rows,
		columns,
		getRowId,
		label,
		rowHeight = 44,
		maxHeight,
		defaultSort = null,
		sort = $bindable(defaultSort),
		onSortChange,
		markable = false,
		onMarkChange,
		getRowLabel,
		...restProps
	}: SortableTableProps<T> = $props();

	const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

	let marked = $state<string | null>(null);
	let touched = $state(false);
	let moving = $state(false);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (settleTimer) clearTimeout(settleTimer);
	});

	function getValue(row: T, columnId: string): string | number | null | undefined {
		const column = columns.find((c) => c.id === columnId);
		return column?.value ? column.value(row) : null;
	}

	function isSortNumber(value: string | number): value is number {
		return typeof value === 'number';
	}

	const ordered = $derived.by(() => {
		const current = sort;
		const base = rows.map((row, i) => ({ id: getRowId(row), row, i }));

		if (current) {
			const dir = current.direction === 'asc' ? 1 : -1;
			base.sort((x, y) => {
				const a = getValue(x.row, current.columnId);
				const b = getValue(y.row, current.columnId);
				const emptyA = a === null || a === undefined || a === '';
				const emptyB = b === null || b === undefined || b === '';
				if (emptyA || emptyB) {
					if (emptyA && emptyB) return x.i - y.i;
					return emptyA ? 1 : -1;
				}
				const d =
					isSortNumber(a) && isSortNumber(b) ? a - b : collator.compare(String(a), String(b));
				return d === 0 ? x.i - y.i : d * dir;
			});
		}

		return base.map(({ id, row }, index) => ({ id, row, index }));
	});

	const template = $derived(
		(markable ? '28px ' : '') + columns.map((c) => c.width ?? 'minmax(0, 1fr)').join(' ')
	);

	function ariaSort(columnId: string): 'ascending' | 'descending' | 'none' {
		return sort?.columnId === columnId
			? sort.direction === 'asc'
				? 'ascending'
				: 'descending'
			: 'none';
	}

	function toggle(columnId: string) {
		const current = sort;
		const next: SortState | null =
			!current || current.columnId !== columnId
				? { columnId, direction: 'asc' }
				: current.direction === 'asc'
					? { columnId, direction: 'desc' }
					: null;

		sort = next;
		onSortChange?.(next);
	}

	function onToggle(columnId: string) {
		touched = true;
		toggle(columnId);
		if (reducedMotion.current) return;
		moving = true;
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			moving = false;
		}, SETTLE_MS);
	}

	function onMark(id: string) {
		const next = marked === id ? null : id;
		marked = next;
		onMarkChange?.(next);
	}

	function nameOf(row: T): string {
		return getRowLabel?.(row) ?? String(columns[0]?.value?.(row) ?? getRowId(row));
	}

	function cellText(column: SortableColumn<T>, row: T): string {
		if (column.cell) return column.cell(row);
		const raw = column.value?.(row);
		return raw === null || raw === undefined || raw === '' ? '—' : String(raw);
	}

	const activeHeader = $derived(columns.find((c) => c.id === sort?.columnId)?.header);

	const message = $derived(
		!touched
			? ''
			: sort && activeHeader
				? `Sorted by ${activeHeader}, ${sort.direction === 'asc' ? 'ascending' : 'descending'}. ${rows.length} rows.`
				: `Original order restored. ${rows.length} rows.`
	);
</script>

<div
	{...restProps}
	class={cn(
		'border-border bg-card overflow-hidden rounded-[14px] border shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)]',
		className
	)}
>
	<div
		role="table"
		aria-label={label}
		aria-rowcount={rows.length + 1}
		aria-colcount={columns.length + (markable ? 1 : 0)}
	>
		<div role="rowgroup">
			<div
				role="row"
				aria-rowindex={1}
				class="border-border grid h-9 items-center gap-x-2 border-b px-2"
				style:grid-template-columns={template}
			>
				{#if markable}
					<div role="columnheader" class="min-w-0">
						<span class="sr-only">Follow</span>
					</div>
				{/if}

				{#each columns as column (column.id)}
					{@const state = ariaSort(column.id)}
					{@const active = state !== 'none'}
					{@const end = column.align === 'end'}

					<div
						role="columnheader"
						aria-sort={column.sortable === false ? undefined : state}
						class="min-w-0"
					>
						{#if column.sortable === false}
							<span
								class={cn(
									'text-muted-foreground block truncate px-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase',
									end && 'text-right'
								)}
							>
								{column.header}
							</span>
						{:else}
							<button
								type="button"
								onclick={() => onToggle(column.id)}
								class={cn(
									'group focus-visible:bg-primary/5 flex h-7 w-full items-center gap-1.5 rounded-[6px] px-1.5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]',
									end && 'flex-row-reverse'
								)}
							>
								<span
									class={cn(
										'truncate text-[11px] font-semibold tracking-[0.08em] uppercase',
										active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
									)}
								>
									{column.header}
								</span>
								<span
									aria-hidden="true"
									class="text-foreground shrink-0"
									{@attach motionTo(() => ({
										keyframes: {
											rotate: state === 'descending' ? 180 : 0,
											opacity: active ? 1 : 0,
											scale: active ? 1 : 0.72
										},
										transition: SMALL
									}))}
								>
									<svg width="9" height="9" viewBox="0 0 10 10" fill="none">
										<path
											d="M5 8.6V1.6M5 1.6 2.2 4.4M5 1.6l2.8 2.8"
											stroke="currentColor"
											stroke-width="1.4"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</span>
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<div
			role="rowgroup"
			class={cn(
				'relative overflow-y-auto overscroll-contain',
				maxHeight !== undefined && '[scrollbar-gutter:stable]'
			)}
			style:height={`${(rows.length || 1) * rowHeight}px`}
			style:max-height={maxHeight !== undefined ? `${maxHeight}px` : undefined}
		>
			{#if rows.length === 0}
				<div
					role="row"
					class="absolute inset-x-0 top-0 flex items-center px-3.5"
					style:height={`${rowHeight}px`}
				>
					<span role="cell" class="text-muted-foreground text-[12.5px]">No rows</span>
				</div>
			{/if}

			{#each ordered as entry (entry.id)}
				{@const isMarked = markable && marked === entry.id}
				<div
					role="row"
					aria-rowindex={entry.index + 2}
					aria-current={isMarked ? true : undefined}
					{@attach motionTo(() => ({
						keyframes: { y: entry.index * rowHeight },
						transition: { ...CELL, delay: Math.min(entry.index, STEP_CAP) * STEP }
					}))}
					class={cn(
						'absolute inset-x-0 top-0 grid items-center gap-x-2 px-2 transition-colors duration-150',
						isMarked && 'bg-muted'
					)}
					style:height={`${rowHeight}px`}
					style:grid-template-columns={template}
				>
					{#if markable}
						<div role="cell" class="min-w-0">
							<button
								type="button"
								aria-pressed={marked === entry.id}
								onclick={() => onMark(entry.id)}
								class={cn(
									'focus-visible:border-ring flex size-[18px] items-center justify-center rounded-[5px] border outline-none focus-visible:shadow-[0_1px_3px_rgba(0,0,0,0.18)]',
									marked === entry.id
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border text-transparent'
								)}
							>
								<span class="sr-only">Follow {nameOf(entry.row)}</span>
								<svg
									aria-hidden="true"
									width="11"
									height="11"
									viewBox="0 0 12 12"
									fill="none"
									{@attach motionTo(() => ({
										keyframes: { scale: marked === entry.id ? 1 : 0.4 },
										transition: CELL
									}))}
								>
									<path
										d="M2.6 6.3 4.9 8.6 9.4 3.4"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
						</div>
					{/if}

					{#each columns as column, c (column.id)}
						<div
							role="cell"
							class={cn(
								'min-w-0 truncate px-1.5 text-[13px]',
								column.align === 'end' && 'text-right',
								column.numeric && 'tabular-nums',
								c === 0 ? 'text-foreground font-medium' : 'text-muted-foreground'
							)}
						>
							{cellText(column, entry.row)}
						</div>
					{/each}
				</div>
			{/each}

			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-0"
				{@attach motionTo(() => ({
					keyframes: { opacity: moving ? 0 : 1 },
					transition: moving ? HIDE : SHOW
				}))}
			>
				{#each Array.from({ length: Math.max(0, rows.length - 1) }, (_, i) => i) as i (i)}
					<div
						class="border-border absolute inset-x-0 border-t"
						style:top={`${(i + 1) * rowHeight}px`}
					></div>
				{/each}
			</div>
		</div>
	</div>
	<div role="status" aria-live="polite" class="sr-only">{message}</div>
</div>
