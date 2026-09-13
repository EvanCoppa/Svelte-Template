<script lang="ts">
	import type { ChatStatus } from 'ai';
	import { tick } from 'svelte';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import MicIcon from '@lucide/svelte/icons/mic';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import SquareIcon from '@lucide/svelte/icons/square';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { canDictate, newRecognition, readResults, type Recognition } from '$lib/speech';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The prompt box: one rounded card holding the field and its controls —
	 * `+` for the openers, the microphone, and send. Enter sends, Shift+Enter
	 * breaks a line, ↑ and ↓ walk back through what you have already asked,
	 * and the button becomes Stop while an answer streams. The draft is the
	 * composer's own state — the page hears about it only when it is sent.
	 *
	 * The controls sit beside the field while what you are writing still fits
	 * on one line, and drop to their own row under it when it does not, so a
	 * long prompt gets the whole width instead of a narrowing slot.
	 */
	let {
		ref = $bindable(null),
		class: className,
		status,
		disabled = false,
		placeholder = 'Ask anything…',
		history = [],
		suggestions = [],
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
		/** Openers the `+` menu offers, in the page's own words. */
		suggestions?: string[];
		onSend: (text: string) => void;
		onStop: () => void;
	} = $props();

	let draft = $state('');
	let field = $state<HTMLTextAreaElement | null>(null);

	// Command-history walk. -1 is "not walking"; otherwise an index into
	// `history`, with the draft that was interrupted kept to come back to.
	let recalled = $state(-1);
	let interrupted = '';

	const busy = $derived(status === 'submitted' || status === 'streaming');
	const canSend = $derived(!disabled && !busy && draft.trim().length > 0);

	/**
	 * Whether the draft still fits beside the controls. Measured off a hidden
	 * copy of the text rather than the field's own height: asking "has it
	 * wrapped yet" would wrap in the narrow slot, widen, unwrap, narrow, and
	 * oscillate. Asking "would it fit unwrapped" settles.
	 */
	let measure = $state<HTMLSpanElement | null>(null);
	let controls = $state<HTMLDivElement | null>(null);
	let wide = $state(false);

	/** The three icon buttons and the gaps between everything. */
	const CONTROLS_WIDTH = 32 * 3 + 4 * 3;

	$effect(() => {
		void draft;
		if (!measure || !controls) return;
		const inline = controls.clientWidth - CONTROLS_WIDTH;
		wide = draft.includes('\n') || measure.offsetWidth + 8 > inline;
	});

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

	/** An opener goes into the field rather than straight out, so it can be edited first. */
	async function insert(text: string) {
		draft = draft.trim() ? `${draft.trimEnd()} ${text}` : text;
		recalled = -1;
		await tick();
		field?.focus();
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

	/**
	 * Dictation. The engine is built once, on the first press, because
	 * constructing one asks the browser for the microphone; where there is no
	 * engine at all the button is never drawn (see `$lib/speech`).
	 */
	const dictates = $derived(canDictate());
	let recognition: Recognition | null = null;
	let listening = $state(false);
	/** What the engine is still revising — shown, but not yet part of the draft. */
	let pending = $state('');

	function listen() {
		recognition ??= newRecognition();
		if (!recognition) return;

		if (listening) {
			// Settle here rather than waiting for `onend`: an engine that never
			// sends one would leave the meter running with nothing behind it.
			listening = false;
			pending = '';
			recognition.stop();
			return;
		}

		recognition.onresult = (event) => {
			const { settled, pending: revising } = readResults(event);
			if (settled) draft = draft.trim() ? `${draft.trimEnd()} ${settled.trim()}` : settled.trim();
			pending = revising;
		};
		recognition.onerror = () => recognition?.stop();
		recognition.onend = () => {
			listening = false;
			pending = '';
		};

		recognition.start();
		listening = true;
	}

	$effect(() => () => {
		if (listening) recognition?.stop();
	});
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
		class="border-border bg-background focus-within:border-ring/60 flex flex-col gap-1.5 rounded-[16px] border p-2 shadow-sm transition-[border-color] duration-150"
	>
		<!-- A copy of the draft at the field's own metrics, off-screen: what
		     says whether the controls still fit beside it. -->
		<span
			bind:this={measure}
			aria-hidden="true"
			class="pointer-events-none invisible absolute text-sm leading-5 whitespace-pre"
		>
			{draft}
		</span>

		<div
			bind:this={controls}
			class={['grid items-end gap-x-1 gap-y-1.5', 'grid-cols-[32px_minmax(0,1fr)_32px_32px]']}
		>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger disabled={disabled || suggestions.length === 0}>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							class={cn(
								'text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground size-8 shrink-0 justify-self-start rounded-[9px] active:scale-[0.94]',
								wide ? 'col-start-1 row-start-2' : 'col-start-1 row-start-1'
							)}
							aria-label="Openers"
						>
							<PlusIcon class="size-[18px]" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content side="top" align="start" class="w-80 rounded-[10px] p-1">
					<DropdownMenu.Group>
						{#each suggestions as suggestion (suggestion)}
							<DropdownMenu.Item
								class="h-9 gap-2.5 rounded-[6px] px-2"
								onclick={() => insert(suggestion)}
							>
								<SparklesIcon />
								<span class="truncate text-[12.5px]">{suggestion}</span>
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Group>
					<p class="border-border text-muted-foreground mt-1 border-t px-2 pt-1.5 pb-1 text-[11px]">
						They land in the box, so you can edit first.
					</p>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<Textarea
				bind:ref={field}
				bind:value={draft}
				placeholder={listening ? 'Listening…' : placeholder}
				{disabled}
				rows={1}
				aria-label="Message the assistant"
				class={cn(
					'max-h-[200px] min-h-8 resize-none border-0 bg-transparent px-1.5 py-1.5 text-sm leading-5 shadow-none focus-visible:ring-0 disabled:opacity-50 dark:bg-transparent',
					wide ? 'col-span-full col-start-1 row-start-1' : 'col-start-2 row-start-1'
				)}
				{onkeydown}
				oninput={() => (recalled = -1)}
			/>

			{#if dictates}
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={listening ? 'Stop dictation' : 'Start dictation'}
					aria-pressed={listening}
					class={cn(
						'size-8 shrink-0 rounded-[9px] active:scale-[0.94]',
						listening
							? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
							: 'text-muted-foreground hover:text-foreground',
						wide ? 'col-start-3 row-start-2' : 'col-start-3 row-start-1'
					)}
					onclick={listen}
				>
					{#if listening}
						<span class="flex h-3.5 items-center gap-[2.5px]" aria-hidden="true">
							<span class="eq h-full w-[2.5px] rounded-full bg-current"></span>
							<span class="eq h-full w-[2.5px] rounded-full bg-current"></span>
							<span class="eq h-full w-[2.5px] rounded-full bg-current"></span>
						</span>
					{:else}
						<MicIcon class="size-[17px]" />
					{/if}
				</Button>
			{/if}

			{#if busy}
				<Button
					type="button"
					size="icon"
					class={cn(
						'from-primary size-7 shrink-0 rounded-[8px] bg-gradient-to-br to-[oklch(from_var(--primary)_0.74_calc(c_*_0.6)_calc(h_-_28))]',
						wide ? 'col-start-4 row-start-2' : 'col-start-4 row-start-1'
					)}
					onclick={onStop}
					aria-label="Stop"
				>
					{#if status === 'submitted'}
						<Spinner class="size-3.5" />
					{:else}
						<SquareIcon class="size-3 fill-current" />
					{/if}
				</Button>
			{:else}
				<Button
					type="submit"
					size="icon"
					class={cn(
						'from-primary size-7 shrink-0 rounded-[8px] bg-gradient-to-br to-[oklch(from_var(--primary)_0.74_calc(c_*_0.6)_calc(h_-_28))] transition-opacity enabled:hover:opacity-90 enabled:active:scale-[0.94] disabled:opacity-30',
						wide ? 'col-start-4 row-start-2' : 'col-start-4 row-start-1'
					)}
					disabled={!canSend}
					aria-label="Send"
				>
					<ArrowUpIcon class="size-[18px]" />
				</Button>
			{/if}
		</div>
	</div>

	<p class="text-muted-foreground mt-3 text-center text-xs" aria-live="polite">
		{#if listening && pending}
			<span class="italic">{pending}</span>
		{:else}
			The assistant can make mistakes. Check important information.
		{/if}
	</p>
</form>

<style>
	/* The microphone becomes a level meter while it is listening. */
	.eq {
		animation: eq-bounce 900ms ease-in-out infinite;
		transform-origin: center;
	}

	.eq:nth-child(2) {
		animation-delay: 150ms;
	}

	.eq:nth-child(3) {
		animation-delay: 300ms;
	}

	@keyframes eq-bounce {
		0%,
		100% {
			transform: scaleY(0.35);
		}
		50% {
			transform: scaleY(1);
		}
	}

	/* Asked for less motion, the bars hold a readable level instead. */
	@media (prefers-reduced-motion: reduce) {
		.eq {
			animation: none;
			transform: scaleY(0.6);
		}
	}
</style>
