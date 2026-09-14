<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { invalidate } from '$app/navigation';
	import { adminTierHref } from '$lib/admin/nav';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { QUERY } from '$lib/queries';
	import type { AdminTier } from '$lib/server/admin/catalog';
	import { createTierSchema } from './schema';

	let { data } = $props();

	let createOpen = $state(false);

	const {
		form: createData,
		errors: createErrors,
		message: createMessage,
		submitting: creating,
		enhance: createEnhance
	} = superForm(data.form, {
		validators: zod4Client(createTierSchema),
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (!form.valid) return;
			createOpen = false;
			toast.success(`${form.data.name} added`);
			invalidate(QUERY.adminCatalog);
		}
	});

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, AdminTier>();
	const columns = columnHelper.columns([
		columnHelper.accessor('id', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'ID' }),
			cell: ({ getValue }) => getValue()
		}),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' }),
			cell: ({ getValue, row }) => DataTable.linkCell(getValue(), adminTierHref(row.original.id))
		}),
		columnHelper.accessor('organizations', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Organizations' })
		}),
		columnHelper.accessor('features', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Features' })
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.tiers;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />

		<PageHeader.Actions>
			<Modal.Root bind:open={createOpen}>
				<Modal.Trigger>
					{#snippet child({ props })}
						<Button {...props}>
							<PlusIcon />
							New plan
						</Button>
					{/snippet}
				</Modal.Trigger>
				<Modal.Content>
					<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
					<form method="POST" action="?/create" use:createEnhance>
						<Modal.Card>
							<Modal.Header>
								<Modal.Title><LayersIcon /> New plan</Modal.Title>
								<Modal.Description>
									A new plan unlocks nothing until you pick its features, which is the honest
									starting point: every feature shows as an upgrade prompt rather than being given
									away.
								</Modal.Description>
							</Modal.Header>
							<Modal.Body>
								<FormAlert message={$createMessage} class="mb-0" />

								<div class="grid gap-2">
									<Label for="tier-id">Identifier</Label>
									<Input
										id="tier-id"
										name="id"
										autocomplete="off"
										placeholder="scale"
										aria-invalid={$createErrors.id ? 'true' : undefined}
										bind:value={$createData.id}
									/>
									<p class="text-muted-foreground text-xs">
										Permanent: every organization and feature row points at it.
									</p>
									{#if $createErrors.id}
										<p class="text-destructive text-sm">{$createErrors.id}</p>
									{/if}
								</div>

								<div class="grid gap-2">
									<Label for="tier-name">Name</Label>
									<Input
										id="tier-name"
										name="name"
										autocomplete="off"
										placeholder="Scale"
										aria-invalid={$createErrors.name ? 'true' : undefined}
										bind:value={$createData.name}
									/>
									{#if $createErrors.name}
										<p class="text-destructive text-sm">{$createErrors.name}</p>
									{/if}
								</div>
							</Modal.Body>
						</Modal.Card>
						<Modal.Footer>
							<Modal.Cancel>Cancel</Modal.Cancel>
							<Modal.Action type="submit" disabled={$creating}>
								{$creating ? 'Adding…' : 'Add plan'}
							</Modal.Action>
						</Modal.Footer>
					</form>
				</Modal.Content>
			</Modal.Root>
		</PageHeader.Actions>
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="tier" />
	</DataTable.Root>
</div>
