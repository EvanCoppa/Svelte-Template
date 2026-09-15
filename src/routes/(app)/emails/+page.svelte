<script lang="ts">
	import MailIcon from '@lucide/svelte/icons/mail';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';

	/**
	 * Emails: registered as a page so it has a spot in the sidebar, the ⌘K
	 * palette and the feature gate, ahead of the inbox itself being built.
	 * No load, no action — there is nothing to fetch yet.
	 */
</script>

<div class="flex flex-col gap-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<Card.Root>
		<Card.Header>
			<MailIcon class="text-muted-foreground h-8 w-8" />
			<Card.Title>Email is on the way</Card.Title>
			<Card.Description>
				Sending and reading email from here isn't built yet. This page is holding its spot in the
				nav.
			</Card.Description>
		</Card.Header>
	</Card.Root>
</div>
