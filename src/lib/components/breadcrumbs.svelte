<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { breadcrumbs } from '$lib/breadcrumbs.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { titleFor } from '$lib/features/pages';

	/**
	 * The last few pages this tab was on, newest last — mounted once by the
	 * app header. The trail's rules (dedupe, cap, storage) live in
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

	// Runs after every navigation and once on mount (the 'enter' navigation),
	// which is how a full page load enters the trail. A page with no
	// registered title has no name to show, so it is not recorded.
	afterNavigate(() => {
		if (title) breadcrumbs.visit(scope, { path: page.url.pathname, title });
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
						<Breadcrumb.Page>{crumb.title}</Breadcrumb.Page>
					{:else}
						<Breadcrumb.Link href={crumb.path}>{crumb.title}</Breadcrumb.Link>
					{/if}
				</Breadcrumb.Item>
			{/each}
		</Breadcrumb.List>
	</Breadcrumb.Root>
{/if}
