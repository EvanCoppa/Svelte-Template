<script lang="ts">
	import type { ChatStatus } from 'ai';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import SquareIcon from '@lucide/svelte/icons/square';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Kbd } from '$lib/components/ui/kbd/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The prompt box. Enter sends, Shift+Enter breaks a line, and the send
	 * button becomes Stop while an answer streams. The draft is the composer's
	 * own state — the page hears about it only when it is sent.
	 */
	let {
		ref = $bindable(null),
		class: className,
		status,
		disabled = false,
		placeholder = 'Ask about your clients, deals, tasks or tickets…',
		onSend,
		onStop,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLFormElement>, HTMLFormElement>, 'children'> & {
		status: ChatStatus;
		/** True when the assistant cannot take a message at all (not configured). */
		disabled?: boolean;
		placeholder?: string;
		onSend: (text: string) => void;
		onStop: () => void;
	} = $props();

	let draft = $state('');

	const busy = $derived(status === 'submitted' || status === 'streaming');
	const canSend = $derived(!disabled && !busy && draft.trim().length > 0);

	function send() {
		const text = draft.trim();
		if (!text || busy || disabled) return;
		onSend(text);
		draft = '';
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		send();
	}
</script>

<form
	bind:this={ref}
	data-slot="assistant-composer"
	class={cn('flex flex-col gap-2', className)}
	onsubmit={(event) => {
		event.preventDefault();
		send();
	}}
	{...restProps}
>
	<div
		class="border-input bg-background focus-within:border-ring focus-within:ring-ring/50 flex items-end gap-2 rounded-xl border p-2 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]"
	>
		<Textarea
			bind:value={draft}
			{placeholder}
			{disabled}
			rows={1}
			aria-label="Message the assistant"
			class="max-h-48 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
			{onkeydown}
		/>
		{#if busy}
			<Button type="button" variant="outline" size="icon" onclick={onStop} aria-label="Stop">
				{#if status === 'submitted'}
					<Spinner />
				{:else}
					<SquareIcon class="size-3.5 fill-current" />
				{/if}
			</Button>
		{:else}
			<Button type="submit" size="icon" disabled={!canSend} aria-label="Send">
				<ArrowUpIcon />
			</Button>
		{/if}
	</div>
	<p class="text-muted-foreground flex items-center gap-1.5 px-2 text-xs">
		<Kbd>↵</Kbd> to send
		<span aria-hidden="true">·</span>
		<Kbd>⇧ ↵</Kbd> for a new line
	</p>
</form>
