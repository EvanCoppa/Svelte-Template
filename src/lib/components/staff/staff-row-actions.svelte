<script lang="ts">
	import BanknoteIcon from '@lucide/svelte/icons/banknote';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let {
		name,
		canAssignRoles = false,
		canManagePay = false,
		canRemove = false,
		onManage,
		onManagePay,
		onRemove
	}: {
		/** The member this row is about — it names the trigger for screen readers. */
		name: string;
		/** Owner/admin only — what the member_roles policies accept. */
		canAssignRoles?: boolean;
		/** Owner/admin only — what the staff_compensation policies accept. */
		canManagePay?: boolean;
		canRemove?: boolean;
		onManage: () => void;
		onManagePay: () => void;
		onRemove: () => void;
	} = $props();
</script>

<!-- A reader with none of these permissions gets no menu at all rather than an empty one. -->
{#if canAssignRoles || canManagePay || canRemove}
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
				{#if canAssignRoles}
					<DropdownMenu.Item onclick={onManage}>
						<UserCogIcon />
						Manage roles
					</DropdownMenu.Item>
				{/if}
				{#if canManagePay}
					<DropdownMenu.Item onclick={onManagePay}>
						<BanknoteIcon />
						Manage pay
					</DropdownMenu.Item>
				{/if}
				{#if canRemove}
					{#if canAssignRoles || canManagePay}
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
