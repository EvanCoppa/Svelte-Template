<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let {
		name,
		canManage = false,
		canRemove = false,
		onManage,
		onRemove
	}: {
		/** The member this row is about — it names the trigger for screen readers. */
		name: string;
		canManage?: boolean;
		canRemove?: boolean;
		onManage: () => void;
		onRemove: () => void;
	} = $props();
</script>

<!-- A reader with neither permission gets no menu at all rather than an empty one. -->
{#if canManage || canRemove}
	<div class="flex justify-end">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" class="size-8">
						<EllipsisIcon />
						<span class="sr-only">Actions for {name}</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				{#if canManage}
					<DropdownMenu.Item onclick={onManage}>
						<UserCogIcon />
						Manage roles
					</DropdownMenu.Item>
				{/if}
				{#if canRemove}
					{#if canManage}
						<DropdownMenu.Separator />
					{/if}
					<DropdownMenu.Item variant="destructive" onclick={onRemove}>
						<UserMinusIcon />
						Remove from organization
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
{/if}
