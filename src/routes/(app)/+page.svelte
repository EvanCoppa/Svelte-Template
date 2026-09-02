<script lang="ts">
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { navItemFor, navItemTarget } from '$lib/navigation';
	import BlocksIcon from '@lucide/svelte/icons/blocks';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LockIcon from '@lucide/svelte/icons/lock';
	import PaletteIcon from '@lucide/svelte/icons/palette';

	let user = $derived(page.data.user);

	// The "Start here" buttons point at feature pages, so they come from the
	// nav the (app) layout filtered for this org and user rather than from a
	// hardcoded href: absent when the feature is hidden, switched off or not
	// readable, locked (→ the upgrade page) when the plan lacks it. A bare
	// `href="/components"` here would advertise a page the gate bounces.
	const startHere = [
		{ pathname: '/components', label: 'Browse components', variant: 'default' },
		{ pathname: '/best-practices', label: 'Read the conventions', variant: 'outline' }
	] as const;
	let startHereLinks = $derived(
		startHere.flatMap(({ pathname, ...cta }) => {
			const item = navItemFor(page.data.nav ?? [], pathname);
			return item ? [{ ...cta, item }] : [];
		})
	);

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

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-8">
	<div class="space-y-1">
		<div class="flex items-center gap-3">
			<h1 class="text-2xl font-bold tracking-tight">Welcome back</h1>
			<Badge variant="secondary">Signed in</Badge>
		</div>
		<p class="text-muted-foreground">
			You are signed in as <span class="text-foreground font-medium">{user?.email}</span>. This page
			— like every page outside <code>/login</code> and <code>/auth</code> — is only reachable with a
			verified session.
		</p>
	</div>

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
				Register your first feature by migration (see <code>docs/features.md</code>), point
				<code>.env</code> at your Supabase project, and delete what you don't need.
			</Card.Description>
		</Card.Header>
		{#if startHereLinks.length > 0}
			<Card.Content class="flex flex-wrap gap-2">
				{#each startHereLinks as { item, label, variant } (item.href)}
					<Button href={navItemTarget(item)} {variant}>
						{#if item.locked}
							<LockIcon class="size-4" aria-label="Upgrade required" />
						{/if}
						{label}
					</Button>
				{/each}
			</Card.Content>
		{/if}
	</Card.Root>
</div>
