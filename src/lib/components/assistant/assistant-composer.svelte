<script lang="ts">
	import type { ChatStatus } from 'ai';
	import { tick } from 'svelte';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import SquareIcon from '@lucide/svelte/icons/square';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The prompt box: one pill holding the field and the one round button at
	 * its end. Enter sends, Shift+Enter breaks a line, ↑ and ↓ walk back
	 * through what you have already asked, and the button becomes Stop while
	 * an answer streams. The draft is the composer's own state — the page
	 * hears about it only when it is sent.
	 */
	let {
		ref = $bindable(null),
		class: className,
		status,
		disabled = false,
		placeholder = 'Ask anything…',
		history = [],
		onSend,
		onStop,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLFormElement>, HTMLFormElement>, 'children'> & {
		status: ChatStatus;
		/** True when the assistant cannot take a message at all (not configured). */
		disabled?: boolean;
		placeholder?: string;
		/** Everything this reader has asked in the thread, oldest first. */
		history?: string[];
		onSend: (text: string) => void;
		onStop: () => void;
	} = $props();

	/**
	 * The one round button at the end of the pill, whether it sends or stops —
	 * named once so the two cannot drift and change colour mid-turn. Its far
	 * stop is derived from `--primary` rather than pinned, the way `ui/bubble`'s
	 * tinted variant derives its fill, so a re-theme carries both ends of the
	 * gradient.
	 */
	const BUTTON =
		'from-primary to-[oklch(from_var(--primary)_0.74_calc(c_*_0.6)_calc(h_-_28))] size-9 shrink-0 rounded-full bg-gradient-to-br';

	let draft = $state('');
	let field = $state<HTMLTextAreaElement | null>(null);

	// Command-history walk. -1 is "not walking"; otherwise an index into
	// `history`, with the draft that was interrupted kept to come back to.
	let recalled = $state(-1);
	let interrupted = '';

	const busy = $derived(status === 'submitted' || status === 'streaming');
	const canSend = $derived(!disabled && !busy && draft.trim().length > 0);

	function send() {
		const text = draft.trim();
		if (!text || busy || disabled) return;
		onSend(text);
		draft = '';
		recalled = -1;
		interrupted = '';
	}

	/** Put a recalled prompt in the field, caret at the end so ↑/↓ keep walking. */
	async function recall(index: number) {
		recalled = index;
		draft = history[index];
		await tick();
		field?.setSelectionRange(draft.length, draft.length);
	}

	function onkeydown(event: KeyboardEvent) {
		// The field's own caret decides whether ↑/↓ walk history or move the
		// caret, so read it off the element this composer already holds.
		const caret = field ? { start: field.selectionStart, end: field.selectionEnd } : null;
		const atStart = caret?.start === 0 && caret.end === 0;
		const atEnd = caret?.start === draft.length && caret.end === draft.length;

		// ↑ only walks back from the very start of the field, so it still moves
		// the caret through a draft that has more than one line.
		if (event.key === 'ArrowUp' && atStart && history.length > 0) {
			event.preventDefault();
			if (recalled === -1) {
				interrupted = draft;
				recall(history.length - 1);
			} else if (recalled > 0) {
				recall(recalled - 1);
			}
			return;
		}

		// ↓ walks forward again, and off the end of the walk puts the draft back.
		if (event.key === 'ArrowDown' && atEnd && recalled !== -1) {
			event.preventDefault();
			if (recalled < history.length - 1) {
				recall(recalled + 1);
			} else {
				recalled = -1;
				draft = interrupted;
			}
			return;
		}

		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		send();
	}
</script>

<form
	bind:this={ref}
	data-slot="assistant-composer"
	class={cn('flex flex-col', className)}
	onsubmit={(event) => {
		event.preventDefault();
		send();
	}}
	{...restProps}
>
	<div
		class="border-border/70 bg-background focus-within:border-border rounded-[28px] border px-2 py-2 shadow-sm transition-shadow hover:shadow-md"
	>
		<div class="flex items-center gap-1">
			<Textarea
				bind:ref={field}
				bind:value={draft}
				{placeholder}
				{disabled}
				rows={1}
				aria-label="Message the assistant"
				class="max-h-[200px] min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 shadow-none focus-visible:ring-0 disabled:opacity-50 dark:bg-transparent"
				{onkeydown}
				oninput={() => (recalled = -1)}
			/>
			{#if busy}
				<Button type="button" size="icon" class={BUTTON} onclick={onStop} aria-label="Stop">
					{#if status === 'submitted'}
						<Spinner />
					{:else}
						<SquareIcon class="size-3.5 fill-current" />
					{/if}
				</Button>
			{:else}
				<Button
					type="submit"
					size="icon"
					class={cn(BUTTON, 'transition-opacity hover:opacity-90 disabled:opacity-30')}
					disabled={!canSend}
					aria-label="Send"
				>
					<ArrowUpIcon class="size-5" />
				</Button>
			{/if}
		</div>
	</div>
	<p class="text-muted-foreground mt-3 text-center text-xs">
		The assistant can make mistakes. Check important information.
	</p>
</form>
