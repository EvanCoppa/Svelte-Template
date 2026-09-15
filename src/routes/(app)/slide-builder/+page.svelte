<script lang="ts">
	import PresentationIcon from '@lucide/svelte/icons/presentation';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';

	/**
	 * Slide Builder: a standalone home for slide decks, separate from the
	 * proposal builder that authors them today (`/proposals/new`). Registered
	 * as a page ahead of the screen itself, like Emails.
	 */
</script>

<div class="flex flex-col gap-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<Card.Root>
		<Card.Header>
			<PresentationIcon class="text-muted-foreground h-8 w-8" />
			<Card.Title>Slide Builder is on the way</Card.Title>
			<Card.Description>
				Building and reusing slide decks outside a proposal isn't built yet. This page is holding
				its spot in the nav.
			</Card.Description>
		</Card.Header>
	</Card.Root>
</div>
