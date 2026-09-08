<script lang="ts">
	import { page } from '$app/state';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import BlocksIcon from '@lucide/svelte/icons/blocks';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LockIcon from '@lucide/svelte/icons/lock';
	import PaletteIcon from '@lucide/svelte/icons/palette';

	let user = $derived(page.data.user);

	const features = [
		{
			icon: LockIcon,
			title: 'Auth, done right',
			body: 'Server-verified sessions via safeGetSession, a default-deny route guard in hooks.server.ts, login, password reset, and recovery pinning.'
		},
		{
			icon: PaletteIcon,
			title: 'App shell',
			body: 'Collapsible sidebar with hover-peek, sticky blurred header, ⌘K palette, dark mode — every entry resolved from the feature registry for the active org.'
		},
		{
			icon: BlocksIcon,
			title: 'shadcn-svelte primitives',
			body: 'Button, input, select, combobox, dialog, dropdown, table and more, vendored under src/lib/components/ui and yours to edit.'
		},
		{
			icon: BookOpenIcon,
			title: 'Documented conventions',
			body: 'Query keys and invalidation, form actions vs endpoints, load-function rules — written down in docs/ so every project starts aligned.'
		}
	];
</script>

<div class="mx-auto max-w-5xl space-y-8">
	<PageHeader.Root>
		<PageHeader.Title>Welcome back</PageHeader.Title>
		<PageHeader.Actions>
			<Badge variant="secondary">Signed in as {user?.email}</Badge>
		</PageHeader.Actions>
	</PageHeader.Root>

	<div class="grid gap-4 sm:grid-cols-2">
		{#each features as feature (feature.title)}
			<Card.Root>
				<Card.Header>
					<feature.icon class="text-primary mb-2 size-5" />
					<Card.Title>{feature.title}</Card.Title>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground text-sm">{feature.body}</p>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Start here</Card.Title>
			<Card.Description>
				Rename the app in <code>src/lib/navigation.ts</code> and
				<code>src/lib/components/app-sidebar.svelte</code>, point
				<code>.env</code> at your Supabase project, and delete what you don't need.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-wrap gap-2">
			<Button href="/components" variant="default">Browse components</Button>
			<Button href="/best-practices" variant="outline">Read the conventions</Button>
		</Card.Content>
	</Card.Root>
</div>
