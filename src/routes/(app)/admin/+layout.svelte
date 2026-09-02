<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';

	let { children } = $props();

	const sections = [
		{ href: '/admin/features', label: 'Features' },
		{ href: '/admin/roles', label: 'Roles' },
		{ href: '/admin/organizations', label: 'Organizations' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<div class="mx-auto max-w-6xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Admin</h1>
		<p class="text-muted-foreground">
			Operator console: the feature registry, the role catalog and every organization's plan.
			Changes apply to everyone on their next request.
		</p>
	</div>

	<nav class="flex flex-wrap gap-1" aria-label="Admin sections">
		{#each sections as section (section.href)}
			<Button
				href={section.href}
				variant={isActive(section.href) ? 'secondary' : 'ghost'}
				size="sm"
				aria-current={isActive(section.href) ? 'page' : undefined}
			>
				{section.label}
			</Button>
		{/each}
	</nav>

	{@render children()}
</div>
