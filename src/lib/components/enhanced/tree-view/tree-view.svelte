<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	export interface TreeNode {
		/** Stable id — it keys expansion, selection and the roving focus. */
		id: string;
		label: string;
		/** Trailing note, e.g. a file size. */
		meta?: string;
		children?: TreeNode[];
	}

	export interface TreeRow {
		node: TreeNode;
		level: number;
		parentId: string | null;
		posinset: number;
		setsize: number;
		branch: boolean;
		open: boolean;
	}

	export interface TreeViewProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The tree, root list first. Each node is { id, label, meta?, children? }. */
		nodes: TreeNode[];
		/** Accessible name for the tree. */
		label: string;
		/** Open branch ids. Bindable; omit it and the tree keeps its own. */
		expanded?: string[];
		/** Uncontrolled starting open set. */
		defaultExpanded?: string[];
		/** Fires with the next open set on every toggle. */
		onExpandedChange?: (expanded: string[]) => void;
		/** Selected id. Bindable; `null` means nothing is chosen. */
		selected?: string | null;
		/** Uncontrolled starting selection. */
		defaultSelected?: string | null;
		/** Fires when a row is chosen by click, Enter or Space. */
		onSelectedChange?: (selected: string) => void;
	}
</script>

<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { cn } from '$lib/utils.js';
	import { motionCollapse, motionTo, motionTransition } from '$lib/motion.js';

	/** The caret swinging to point at the open folder. */
	const SMALL = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const LEAVE: [number, number, number, number] = [0.4, 0, 1, 1];
	const OPEN_H = { duration: 0.28, ease: EASE } as const;
	const OPEN_O = { duration: 0.18, ease: EASE } as const;
	const SHUT_H = { duration: 0.2, ease: LEAVE } as const;
	const SHUT_O = { duration: 0.14, ease: LEAVE } as const;

	function flatten(
		list: TreeNode[],
		openSet: ReadonlySet<string>,
		level = 1,
		parentId: string | null = null,
		out: TreeRow[] = []
	): TreeRow[] {
		list.forEach((node, i) => {
			const children = node.children ?? [];
			const branch = children.length > 0;
			const open = branch && openSet.has(node.id);
			out.push({
				node,
				level,
				parentId,
				posinset: i + 1,
				setsize: list.length,
				branch,
				open
			});
			if (open) flatten(children, openSet, level + 1, node.id, out);
		});
		return out;
	}

	let {
		class: className,
		nodes,
		label,
		defaultExpanded = [],
		expanded = $bindable(defaultExpanded.slice()),
		onExpandedChange,
		defaultSelected = null,
		selected = $bindable(defaultSelected),
		onSelectedChange,
		...restProps
	}: TreeViewProps = $props();

	const hintId = $props.id();

	const openSet = $derived(new Set(expanded ?? []));
	const rows = $derived(flatten(nodes, openSet));
	const rowsById = $derived(new Map(rows.map((row) => [row.node.id, row])));

	let focusId = $state<string | null>(null);

	const tabStop = $derived.by(() => {
		if (focusId !== null && rowsById.has(focusId)) return focusId;
		if (selected && rowsById.has(selected)) return selected;
		return rows[0]?.node.id ?? null;
	});

	const refs = new SvelteMap<string, HTMLElement>();

	function registerRow(id: string) {
		return (node: HTMLElement) => {
			refs.set(id, node);
			return () => {
				if (refs.get(id) === node) refs.delete(id);
			};
		};
	}

	function focusRow(id: string) {
		focusId = id;
		refs.get(id)?.focus();
	}

	function setExpanded(next: string[]) {
		expanded = next;
		onExpandedChange?.(next);
	}

	function toggle(id: string) {
		const list = expanded ?? [];
		setExpanded(list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]);
	}

	function select(id: string) {
		selected = id;
		onSelectedChange?.(id);
	}

	function activate(id: string) {
		const row = rowsById.get(id);
		select(id);
		focusRow(id);
		if (row?.branch) toggle(id);
	}

	function handleKey(event: KeyboardEvent, id: string) {
		const row = rowsById.get(id);
		if (!row) return;

		const at = rows.findIndex((entry) => entry.node.id === id);
		const go = (index: number) => {
			const target = rows[index];
			if (target) focusRow(target.node.id);
		};

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				go(at + 1);
				return;
			case 'ArrowUp':
				event.preventDefault();
				go(at - 1);
				return;
			case 'ArrowRight':
				event.preventDefault();
				if (row.branch && !row.open) toggle(id);
				else if (row.open) go(at + 1);
				return;
			case 'ArrowLeft':
				event.preventDefault();
				if (row.open) toggle(id);
				else if (row.parentId) focusRow(row.parentId);
				return;
			case 'Home':
				event.preventDefault();
				go(0);
				return;
			case 'End':
				event.preventDefault();
				go(rows.length - 1);
				return;
			case 'Enter':
			case ' ':
				event.preventDefault();
				select(id);
				if (row.branch) toggle(id);
				return;
			default:
				break;
		}

		if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
			const letter = event.key.toLowerCase();
			if (letter === ' ') return;
			for (let step = 1; step <= rows.length; step += 1) {
				const candidate = rows[(at + step) % rows.length];
				if (candidate.node.label.toLowerCase().startsWith(letter)) {
					event.preventDefault();
					focusRow(candidate.node.id);
					return;
				}
			}
		}
	}
</script>

{#snippet branch(list: TreeNode[], level: number)}
	{#each list as node, i (node.id)}
		{@const children = node.children ?? []}
		{@const isBranch = children.length > 0}
		{@const open = isBranch && openSet.has(node.id)}
		{@const isSelected = selected === node.id}

		<li role="none">
			<div
				role="treeitem"
				aria-level={level}
				aria-posinset={i + 1}
				aria-setsize={list.length}
				aria-expanded={isBranch ? open : undefined}
				aria-selected={isSelected}
				aria-describedby={hintId}
				tabindex={tabStop === node.id ? 0 : -1}
				onfocus={() => (focusId = node.id)}
				onkeydown={(event) => handleKey(event, node.id)}
				onclick={() => activate(node.id)}
				{@attach registerRow(node.id)}
				class={cn(
					'focus-visible:bg-primary/5 flex h-7 cursor-default items-center gap-1 rounded-[8px] px-1.5 transition-colors duration-150 outline-none select-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]',
					isSelected
						? 'bg-muted text-foreground'
						: 'text-foreground/70 hover:bg-muted/60 hover:text-foreground'
				)}
			>
				{#if isBranch}
					<span
						aria-hidden="true"
						class="text-muted-foreground flex size-4 shrink-0 items-center justify-center"
						{@attach motionTo(() => ({ keyframes: { rotate: open ? 90 : 0 }, transition: SMALL }))}
					>
						<svg viewBox="0 0 12 12" width="10" height="10" focusable="false" aria-hidden="true">
							<path
								d="M4.5 2.5 8 6l-3.5 3.5"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
				{:else}
					<span class="size-4 shrink-0"></span>
				{/if}

				<span class={cn('min-w-0 flex-1 truncate text-[12.5px]', isSelected && 'font-medium')}>
					{node.label}
				</span>

				{#if node.meta}
					<span class="text-muted-foreground shrink-0 font-mono text-[10.5px] tabular-nums">
						{node.meta}
					</span>
				{/if}
			</div>

			{#if isBranch && open}
				<ul
					role="group"
					class="overflow-hidden"
					in:motionCollapse={{ transition: OPEN_H }}
					out:motionCollapse={{ transition: SHUT_H }}
				>
					<div
						class="border-border ml-[13px] border-l pl-[7px]"
						in:motionTransition={{ keyframes: { opacity: [0, 1] }, transition: OPEN_O }}
						out:motionTransition={{ keyframes: { opacity: 0 }, transition: SHUT_O }}
					>
						{@render branch(children, level + 1)}
					</div>
				</ul>
			{/if}
		</li>
	{/each}
{/snippet}

<div
	{...restProps}
	data-slot="tree-view"
	class={cn(
		'border-border bg-card rounded-[13px] border p-[5px] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)]',
		className
	)}
>
	<ul role="tree" aria-label={label}>
		{@render branch(nodes, 1)}
	</ul>
	<span id={hintId} class="sr-only">
		Use the arrow keys to move. Right expands a folder, left collapses it or climbs to its parent.
		Home and End jump to the ends, and typing a letter jumps to the next name starting with it.
	</span>
</div>
