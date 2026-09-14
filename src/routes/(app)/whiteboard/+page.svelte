<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import MousePointer2Icon from '@lucide/svelte/icons/mouse-pointer-2';
	import PaintBucketIcon from '@lucide/svelte/icons/paint-bucket';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SquareIcon from '@lucide/svelte/icons/square';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TypeIcon from '@lucide/svelte/icons/type';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import type { Component } from 'svelte';
	import { page } from '$app/state';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import * as Whiteboard from '$lib/components/whiteboard/index.js';
	import { createBoard } from '$lib/whiteboard/board.svelte';
	import { INKS, TOOLS, WEIGHTS, type Ink, type Tool, type Weight } from '$lib/whiteboard/scene';

	/**
	 * The whiteboard: one canvas, kept on this device.
	 *
	 * The page owns everything — the board (`createBoard`, which is the
	 * `localStorage` scene), what the pointer is doing, what it draws in, what
	 * is selected and where the reader is looking — and hands each of them to
	 * the parts that show them. `Whiteboard.Root` draws and reports finished
	 * gestures; nothing about the board is decided inside it.
	 *
	 * There is no load function and no action, because there is nothing on the
	 * server: a board is device-axis data (docs/user-preferences.md), like the
	 * theme. The page is still gated like every other — by being a registered
	 * feature, which is what puts it in the sidebar and the ⌘K palette and
	 * gives it its title.
	 */

	/** The board belongs to whoever is signed in on this machine. */
	const board = createBoard(page.data.user?.id ?? 'anonymous');

	let tool = $state<Tool>('select');
	let ink = $state<Ink>('ink');
	let weight = $state<Weight>('thin');
	let filled = $state(false);
	let selectedId = $state<string | null>(null);
	let view = $state({ x: 0, y: 0, k: 1 });

	type ToolMeta = { label: string; shortcut: string; icon: Component<{ class?: string }> };

	/** What each tool is called, what draws it, and the key that picks it. */
	const TOOL_META = {
		select: { label: 'Select', shortcut: 'V', icon: MousePointer2Icon },
		rect: { label: 'Rectangle', shortcut: 'R', icon: SquareIcon },
		ellipse: { label: 'Ellipse', shortcut: 'O', icon: CircleIcon },
		arrow: { label: 'Arrow', shortcut: 'A', icon: ArrowRightIcon },
		line: { label: 'Line', shortcut: 'L', icon: MinusIcon },
		draw: { label: 'Draw', shortcut: 'P', icon: PencilIcon },
		text: { label: 'Text', shortcut: 'T', icon: TypeIcon }
	} satisfies Record<Tool, ToolMeta>;

	const INK_LABELS = {
		ink: 'Default',
		red: 'Red',
		amber: 'Amber',
		green: 'Green',
		blue: 'Blue',
		violet: 'Violet'
	} satisfies Record<Ink, string>;

	const WEIGHT_LABELS = {
		thin: 'Thin lines',
		bold: 'Thick lines'
	} satisfies Record<Weight, string>;

	/** The key for each tool, so a keystroke picks one without a second list. */
	const SHORTCUTS: Record<string, Tool> = Object.fromEntries(
		TOOLS.map((id) => [TOOL_META[id].shortcut.toLowerCase(), id])
	);

	const zoom = $derived(Math.round(view.k * 100));

	function remove(): void {
		if (!selectedId) return;
		board.remove(selectedId);
		selectedId = null;
	}

	function clear(): void {
		board.clear();
		selectedId = null;
	}

	function resetView(): void {
		view = { x: 0, y: 0, k: 1 };
	}

	/** A keystroke meant for a field is not a shortcut — a label being worded is typing. */
	function isTyping(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		);
	}

	function onKeydown(event: KeyboardEvent): void {
		if (isTyping(event.target)) return;

		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			board.undo();
			selectedId = null;
			return;
		}
		// Everything below is a bare key, so nothing here can shadow a browser
		// or palette shortcut.
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (event.key === 'Escape') {
			selectedId = null;
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
			event.preventDefault();
			remove();
			return;
		}
		const picked = SHORTCUTS[event.key.toLowerCase()];
		if (picked) tool = picked;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="space-y-4">
	<PageHeader.Root>
		<PageHeader.Title />
		<PageHeader.Actions>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button {...props} onclick={resetView} variant="ghost" size="sm" class="tabular-nums">
							{zoom}%
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Reset the view</Tooltip.Content>
			</Tooltip.Root>
			<Button onclick={board.undo} variant="outline" size="sm" disabled={!board.canUndo}>
				<Undo2Icon />
				Undo
			</Button>
			<Button onclick={clear} variant="outline" size="sm" disabled={board.elements.length === 0}>
				<EraserIcon />
				Clear
			</Button>
		</PageHeader.Actions>
	</PageHeader.Root>

	<Whiteboard.Toolbar aria-label="Drawing tools">
		{#each TOOLS as id (id)}
			{@const meta = TOOL_META[id]}
			{@const Icon = meta.icon}
			<Whiteboard.Tool
				label={meta.label}
				shortcut={meta.shortcut}
				active={tool === id}
				onclick={() => (tool = id)}
			>
				<Icon class="size-4" />
			</Whiteboard.Tool>
		{/each}

		<Separator orientation="vertical" class="mx-1 !h-6" />

		{#each INKS as id (id)}
			<Whiteboard.Swatch
				ink={id}
				label={INK_LABELS[id]}
				active={ink === id}
				onclick={() => (ink = id)}
			/>
		{/each}

		<Separator orientation="vertical" class="mx-1 !h-6" />

		{#each WEIGHTS as id (id)}
			<Whiteboard.Tool
				label={WEIGHT_LABELS[id]}
				active={weight === id}
				onclick={() => (weight = id)}
			>
				<!-- The control is the thing it sets: a line of the weight it picks. -->
				<span
					class="w-4 rounded-full bg-current {id === 'bold' ? 'h-1' : 'h-px'}"
					aria-hidden="true"
				></span>
			</Whiteboard.Tool>
		{/each}

		<Whiteboard.Tool label="Fill shapes" active={filled} onclick={() => (filled = !filled)}>
			<PaintBucketIcon class="size-4" />
		</Whiteboard.Tool>

		<Separator orientation="vertical" class="mx-1 !h-6" />

		<Whiteboard.Tool label="Delete selected" shortcut="⌫" active={false} onclick={remove}>
			<Trash2Icon class="size-4" />
		</Whiteboard.Tool>
	</Whiteboard.Toolbar>

	<div class="relative">
		<Whiteboard.Root
			elements={board.elements}
			{tool}
			{ink}
			{weight}
			{filled}
			{selectedId}
			bind:view
			oncommit={(element) => board.put(element)}
			onpick={(id) => (selectedId = id)}
			ondelete={(id) => board.remove(id)}
			class="h-[70vh] min-h-[28rem]"
			aria-label="Whiteboard"
		/>

		{#if board.elements.length === 0}
			<p
				class="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
			>
				Pick a tool and draw. Everything stays in this browser.
			</p>
		{/if}
	</div>
</div>
