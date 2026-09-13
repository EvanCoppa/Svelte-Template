<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import type { ConversationSummary } from '$lib/server/ai/conversations';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The rail of the member's threads, newest first, with a way to start a
	 * new one and a menu per thread. The page owns the list and what rename
	 * and delete do; this only names the thread they are about.
	 */
	let {
		ref = $bindable(null),
		class: className,
		conversations,
		activeId,
		onRename,
		onDelete,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLElement>>, 'children'> & {
		conversations: ConversationSummary[];
		/** The thread on screen, or null for a new one. */
		activeId: string | null;
		onRename: (conversation: ConversationSummary) => void;
		onDelete: (conversation: ConversationSummary) => void;
	} = $props();

	function nameOf(conversation: ConversationSummary): string {
		return conversation.title ?? 'New conversation';
	}
</script>

<nav
	bind:this={ref}
	data-slot="assistant-history"
	aria-label="Conversations"
	class={cn('flex min-h-0 flex-col gap-3', className)}
	{...restProps}
>
	<Button href="/assistant" variant="outline" class="justify-start" disabled={activeId === null}>
		<PlusIcon />
		New conversation
	</Button>

	<ScrollArea class="min-h-0 flex-1">
		<ul class="flex flex-col gap-0.5 pr-2">
			{#each conversations as conversation (conversation.id)}
				{@const active = conversation.id === activeId}
				<li class="group/thread flex items-center gap-1">
					<Button
						href="/assistant/{conversation.id}"
						variant="ghost"
						class={cn(
							'h-9 min-w-0 flex-1 justify-start font-normal',
							active && 'bg-accent text-accent-foreground'
						)}
						aria-current={active ? 'page' : undefined}
					>
						<span class="truncate">{nameOf(conversation)}</span>
					</Button>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class={cn(
										'size-8 shrink-0 opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
										active && 'opacity-100'
									)}
								>
									<EllipsisIcon />
									<span class="sr-only">Actions for {nameOf(conversation)}</span>
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => onRename(conversation)}>
								<PencilIcon />
								Rename
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" onclick={() => onDelete(conversation)}>
								<Trash2Icon />
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</li>
			{:else}
				<li class="text-muted-foreground px-3 py-2 text-sm">No conversations yet.</li>
			{/each}
		</ul>
	</ScrollArea>
</nav>
