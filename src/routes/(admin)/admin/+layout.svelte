<script lang="ts">
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import { ADMIN_AREA_NAME, adminNav, isAdminItemActive } from '$lib/admin/nav';
	import { iconFor } from '$lib/features/icons';
	import { titleFor } from '$lib/features/pages';

	/**
	 * The platform area's own shell — deliberately not the tenant one.
	 *
	 * No workspace switcher, no feature sidebar, no note dock, no upgrade
	 * prompt, no breadcrumb trail: none of those mean anything without an
	 * organization, and borrowing them would make the platform console look
	 * like one more page of the app it administers. What it keeps is a single
	 * inverted bar carrying the area's identity, its five pages, who is
	 * operating and the way back — so there is never a doubt about which side
	 * of the boundary a screen is on.
	 *
	 * The bar paints from `--foreground`/`--background`, so the inversion
	 * follows the theme rather than pinning a dark colour.
	 */
	let { data, children } = $props();

	// The one <title> for everything in the group, resolved the same way the
	// (app) shell resolves its own: a page's own title wins, else the name the
	// layout load supplied for this path.
	let title = $derived(titleFor(page.data, page.url.pathname));
</script>

<svelte:head>
	<!-- +error.svelte renders its own title; the first <title> in the head wins. -->
	{#if title && !page.error}<title>{title} — {ADMIN_AREA_NAME}</title>{/if}
</svelte:head>

<div class="bg-background text-foreground min-h-svh">
	<header class="bg-foreground text-background">
		<div class="admin-bar flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
			<div class="flex items-center gap-2 font-semibold">
				<ShieldIcon class="size-5 shrink-0" />
				<span>{ADMIN_AREA_NAME}</span>
			</div>

			<nav aria-label={ADMIN_AREA_NAME} class="flex flex-wrap items-center gap-1">
				{#each adminNav as item (item.href)}
					{@const Icon = iconFor(item.icon)}
					{@const active = isAdminItemActive(item, page.url.pathname)}
					<a
						href={item.href}
						aria-current={active ? 'page' : undefined}
						class={[
							'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
							active ? 'bg-background/15 font-medium' : 'opacity-70 hover:opacity-100'
						]}
					>
						<Icon class="size-4 shrink-0" />
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="ms-auto flex items-center gap-4 text-sm">
				{#if data.operator.email}
					<span class="hidden opacity-70 sm:inline">{data.operator.email}</span>
				{/if}
				<!-- The way out, always in the same place. It leaves the platform
				     area entirely; the organization the operator was working in is
				     still the active one, because nothing here touched it. -->
				<a
					href="/"
					class="border-background/30 hover:bg-background/15 flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors"
				>
					<ArrowLeftIcon class="size-4 shrink-0" />
					Back to app
				</a>
			</div>
		</div>
	</header>

	<main class="admin-bar py-8">
		{@render children()}
	</main>
</div>

<style>
	.admin-bar {
		padding-inline: var(--site-padding);
	}

	@media (max-width: 768px) {
		.admin-bar {
			padding-inline: 12px;
		}
	}
</style>
