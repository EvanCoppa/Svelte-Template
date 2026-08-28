<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	const sections = [
		{
			title: 'Mutations: form actions first',
			tag: 'SvelteKit',
			points: [
				'If a mutation is triggered from the page it lives on and the data comes from form inputs, it must be a form action (+page.server.ts) with use:enhance — you get progressive enhancement, error states, and colocation for free.',
				'Reach for a +server.ts endpoint only for: JS-triggered GET fetches (search-as-you-type), request bodies born in JS memory (canvas exports, blobs), cross-page mutations, multi-verb REST paths, or binary/streaming responses.',
				'Return fail(400, { message }) with the user’s input echoed back so forms re-render filled in; redirect(303) after success.'
			]
		},
		{
			title: 'Data flow: load functions',
			tag: 'SvelteKit',
			points: [
				'Server data belongs in load functions, not onMount fetches. Universal load (+page.ts) runs on both sides; server load (+page.server.ts) is for anything touching secrets or the database.',
				'Use the load-provided fetch, never the global one — it forwards cookies and avoids a second round trip during hydration.',
				'Never mutate in a load function. Loads re-run on invalidation; they must be side-effect free.',
				'Declare custom dependencies with depends("app:thing") and refresh them with invalidate("app:thing") — see docs/data-invalidation.md for the query-key convention.'
			]
		},
		{
			title: 'Auth: trust only the server',
			tag: 'Supabase',
			points: [
				'Route protection lives in hooks.server.ts and is default-deny: a new route is private unless added to PUBLIC_PATHS.',
				'safeGetSession() validates the JWT with getUser() before trusting it. Never make an authorization decision from getSession() alone in server code — the cookie is client-controlled input.',
				'Row Level Security stays on for every table even though the app has its own guard. The service-role client (supabase.server.ts) bypasses RLS — create it per request, only in server files, and never feed its results to the client without your own check.'
			]
		},
		{
			title: 'Svelte 5: runes, not legacy',
			tag: 'Svelte',
			points: [
				'$state / $derived / $props everywhere; no export let, no $: statements, no stores for component state, snippets instead of slots.',
				'Compute with $derived, don’t sync with $effect — effects are the escape hatch, and updating state inside one is almost always a bug.',
				'Keyed each blocks always: {#each items as item (item.id)}.',
				'page comes from $app/state (runes-based), not $app/stores.'
			]
		},
		{
			title: 'Server/client boundary',
			tag: 'SvelteKit',
			points: [
				'Secrets and privileged clients live in *.server.ts files or src/lib/server/ — SvelteKit refuses to bundle them client-side, which turns a mistake into a build error.',
				'Private env comes from $env/static/private (or $env/dynamic/private when it may be absent at build time); anything public must be prefixed PUBLIC_.',
				'Everything returned from a load or action is serialized into the page — audit it. Access tokens and refresh tokens do not belong in PageData.',
				'Queries are typed from generated schema types: run npm run db:types after every migration and commit src/lib/database.types.ts. Until you generate, .from() is a compile error by design.'
			]
		},
		{
			title: 'UI conventions',
			tag: 'Template',
			points: [
				'One navigation config (src/lib/navigation.ts) drives the sidebar and the ⌘K palette; add a page by adding a route and one entry.',
				'Import lucide icons one file at a time (@lucide/svelte/icons/x) so the barrel never lands in your bundle.',
				'The ui/ components are vendored source, not a dependency — restyle them in place and commit the change.'
			]
		}
	];
</script>

<svelte:head>
	<title>Best Practices</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Best practices</h1>
		<p class="text-muted-foreground">
			The conventions this template is built around. The long-form versions live in
			<code>docs/sveltekit-best-practices.md</code> and <code>docs/data-invalidation.md</code>; when
			in doubt, the
			<a
				class="underline underline-offset-4"
				href="https://svelte.dev/docs/kit"
				target="_blank"
				rel="noreferrer">SvelteKit docs</a
			>
			and
			<a
				class="underline underline-offset-4"
				href="https://supabase.com/docs/guides/auth/server-side"
				target="_blank"
				rel="noreferrer">Supabase SSR guide</a
			> win.
		</p>
	</div>

	{#each sections as section (section.title)}
		<Card.Root>
			<Card.Header>
				<div class="flex items-center justify-between gap-2">
					<Card.Title>{section.title}</Card.Title>
					<Badge variant="outline">{section.tag}</Badge>
				</div>
			</Card.Header>
			<Card.Content>
				<ul class="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
					{#each section.points as point (point)}
						<li>{point}</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
