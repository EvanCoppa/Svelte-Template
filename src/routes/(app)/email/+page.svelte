<script lang="ts">
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import MailIcon from '@lucide/svelte/icons/mail';
	import { page } from '$app/state';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { recordHref, type RecordKind } from '$lib/crm/records';
	import { featureTerms } from '$lib/features/terms';
	import type { EmailThreadView } from '$lib/server/crm/emails';

	/**
	 * The feed: the organization's latest conversations, newest first, each
	 * naming the records it is filed on — which is where a thread is read in
	 * full and answered. Connecting a mailbox is a settings matter, so the
	 * header's one action leads there.
	 */
	let { data } = $props();

	// What the feature is called, as the org's industry says it — "Emails".
	const terms = $derived(featureTerms(page.data.terms, 'email'));

	// A fixed locale keeps the server render and the hydrated render identical.
	const datetime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

	/** The kinds a message can be filed on, in the order their chips are drawn. */
	const LINKABLE = ['contact', 'company', 'deal'] as const satisfies readonly RecordKind[];

	type Chip = { kind: (typeof LINKABLE)[number]; id: string; name: string };

	/**
	 * The records a thread is filed on, each once, named — only those the
	 * load could name, which is only the kinds this reader may open, so a
	 * chip is never a link to a refusal.
	 */
	function chipsOf(thread: EmailThreadView): Chip[] {
		const chips: Chip[] = [];
		for (const message of thread.messages) {
			for (const link of message.links) {
				const kind = LINKABLE.find((candidate) => candidate === link.entityType);
				if (!kind) continue;
				const name = data.records[kind][link.entityId];
				if (name === undefined) continue;
				if (chips.some((chip) => chip.kind === kind && chip.id === link.entityId)) continue;
				chips.push({ kind, id: link.entityId, name });
			}
		}
		return chips;
	}

	/** Everyone in a conversation, each once, in the order they first appear. */
	function peopleOf(thread: EmailThreadView): string {
		const people: { address: string; name: string }[] = [];
		for (const message of thread.messages) {
			for (const participant of message.participants) {
				if (participant.role === 'bcc') continue;
				if (people.some((person) => person.address === participant.address)) continue;
				people.push({
					address: participant.address,
					name: participant.display_name ?? participant.address
				});
			}
		}
		return people.map((person) => person.name).join(', ');
	}

	/** The opening line of a conversation: what the first message said. */
	function previewOf(thread: EmailThreadView): string {
		const first = thread.messages[0];
		return first?.snippet ?? first?.bodyText ?? '';
	}
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		<PageHeader.Actions>
			<Button variant="outline" href="/settings/integrations">
				<InboxIcon />
				Mailboxes
			</Button>
		</PageHeader.Actions>
	</PageHeader.Root>

	{#if data.threads.length > 0}
		<div class="space-y-3">
			{#each data.threads as thread (thread.id)}
				{@const chips = chipsOf(thread)}
				{@const people = peopleOf(thread)}
				<Card.Root class="gap-3 py-4">
					<Card.Header>
						<Card.Title class="truncate text-base">{thread.subject ?? '(no subject)'}</Card.Title>
						<Card.Description class="truncate">
							{people}
							{#if people !== ''}·{/if}
							{thread.messageCount === 1
								? 'One message'
								: `${String(thread.messageCount)} messages`}
						</Card.Description>
						{#if thread.lastMessageAt}
							<Card.Action>
								<time
									datetime={thread.lastMessageAt}
									class="text-muted-foreground text-xs whitespace-nowrap"
								>
									{datetime.format(new Date(thread.lastMessageAt))}
								</time>
							</Card.Action>
						{/if}
					</Card.Header>
					<Card.Content class="space-y-3">
						{#if previewOf(thread) !== ''}
							<p class="text-muted-foreground line-clamp-2 text-sm">{previewOf(thread)}</p>
						{/if}
						{#if chips.length > 0}
							<div class="flex flex-wrap gap-1.5">
								{#each chips as chip (`${chip.kind}:${chip.id}`)}
									<Badge variant="outline" href={recordHref(chip.kind, chip.id)}>
										{chip.name}
									</Badge>
								{/each}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon"><MailIcon /></Empty.Media>
				<Empty.Title>No {terms.plural} yet</Empty.Title>
				<Empty.Description>
					Conversations from the mailboxes your team connects show up here, filed on the records
					they are about.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button variant="outline" href="/settings/integrations">
					<InboxIcon />
					Connect a mailbox
				</Button>
			</Empty.Content>
		</Empty.Root>
	{/if}
</div>
