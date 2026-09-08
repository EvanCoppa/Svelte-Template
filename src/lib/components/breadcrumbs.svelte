<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { breadcrumbs } from '$lib/breadcrumbs.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { iconFor } from '$lib/features/icons';
	import { titleFor } from '$lib/features/pages';
	import { iconForPath } from '$lib/navigation';

	/**
	 * How far this tab has gone since it last jumped from the shell, newest
	 * last — mounted once by the app header. The trail's rules (where a walk
	 * starts, what deepens it, cap, storage) live in
	 * `$lib/breadcrumbs.svelte`; this file only records and renders.
	 */

	// Named exactly like the document title, from the page registry.
	let title = $derived(titleFor(page.data, page.url.pathname));
	// A trail belongs to one user in one organization.
	let scope = $derived(`${page.data.user?.id ?? ''}:${page.data.activeOrg?.id ?? ''}`);

	// The trail is this tab's, so the server cannot know it, and a scope that
	// has just changed has none yet: either way the current page stands alone
	// until the first visit is recorded.
	let trail = $derived(breadcrumbs.crumbsIn(scope));
	let crumbs = $derived(
		trail.length > 0 ? trail : title ? [{ path: page.url.pathname, title }] : []
	);
	// Only the first crumb leads with an icon — it names where the trail
	// started, so it is the one place an icon helps orient rather than
	// repeating down every step.
	let LeadIcon = $derived.by(() => {
		const slug = crumbs[0] && iconForPath(crumbs[0].path, page.data.nav ?? []);
		return slug ? iconFor(slug) : null;
	});

	// Runs after every navigation and once on mount (the 'enter' navigation),
	// which is how a full page load enters the trail. A page with no
	// registered title has no name to show, so it is not recorded.
	afterNavigate((navigation) => {
		if (!title) return;
		// Going back rewinds the walk rather than extending it; going forward
		// through the same history is an ordinary step. A jump from the sidebar
		// or the palette announced itself before navigating — see `startAt()`.
		const rewound = navigation.type === 'popstate' && (navigation.delta ?? 0) < 0;
		breadcrumbs.visit(scope, { path: page.url.pathname, title }, rewound);
	});
</script>

{#if crumbs.length > 0}
	<Breadcrumb.Root>
		<Breadcrumb.List class="flex-nowrap whitespace-nowrap">
			{#each crumbs as crumb, i (crumb.path)}
				{#if i > 0}
					<Breadcrumb.Separator />
				{/if}
				<Breadcrumb.Item>
					{#if i === crumbs.length - 1}
						<Breadcrumb.Page class="flex items-center gap-1.5">
							{#if i === 0 && LeadIcon}
								<LeadIcon class="size-4" />
							{/if}
							{crumb.title}
						</Breadcrumb.Page>
					{:else}
						<Breadcrumb.Link href={crumb.path} class="flex items-center gap-1.5">
							{#if i === 0 && LeadIcon}
								<LeadIcon class="size-4" />
							{/if}
							{crumb.title}
						</Breadcrumb.Link>
					{/if}
				</Breadcrumb.Item>
			{/each}
		</Breadcrumb.List>
	</Breadcrumb.Root>
{/if}
