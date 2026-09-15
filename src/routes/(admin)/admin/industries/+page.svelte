<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import BlocksIcon from '@lucide/svelte/icons/blocks';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { invalidate } from '$app/navigation';
	import { adminIndustryHref } from '$lib/admin/nav';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { QUERY } from '$lib/queries';
	import type { AdminIndustry } from '$lib/server/admin/catalog';
	import { createIndustrySchema } from './schema';

	let { data } = $props();

	let createOpen = $state(false);

	const {
		form: createData,
		errors: createErrors,
		message: createMessage,
		submitting: creating,
		enhance: createEnhance
	} = superForm(data.form, {
		validators: zod4Client(createIndustrySchema),
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (!form.valid) return;
			createOpen = false;
			toast.success(`${form.data.name} added`);
			invalidate(QUERY.adminCatalog);
		}
	});

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, AdminIndustry>();
	const columns = columnHelper.columns([
		columnHelper.accessor('id', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'ID' }),
			cell: ({ getValue }) => getValue()
		}),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), adminIndustryHref(row.original.id))
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
			return data.industries;
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
							New vertical
						</Button>
					{/snippet}
				</Modal.Trigger>
				<Modal.Content>
					<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
					<form method="POST" action="?/create" use:createEnhance>
						<Modal.Card>
							<Modal.Header>
								<Modal.Title><BlocksIcon /> New vertical</Modal.Title>
								<Modal.Description>
									A new vertical starts with no features — absent means hidden, so its pages do not
									exist yet — and with no roles, which are industry-scoped and ship by migration.
									Owners and admins keep their access regardless, so nobody is locked out.
								</Modal.Description>
							</Modal.Header>
							<Modal.Body>
								<FormAlert message={$createMessage} class="mb-0" />

								<div class="grid gap-2">
									<Label for="industry-id">Identifier</Label>
									<Input
										id="industry-id"
										name="id"
										autocomplete="off"
										placeholder="veterinary"
										aria-invalid={$createErrors.id ? 'true' : undefined}
										bind:value={$createData.id}
									/>
									<p class="text-muted-foreground text-xs">
										Permanent: every organization, role and feature row points at it.
									</p>
									{#if $createErrors.id}
										<p class="text-destructive text-sm">{$createErrors.id}</p>
									{/if}
								</div>

								<div class="grid gap-2">
									<Label for="industry-name">Name</Label>
									<Input
										id="industry-name"
										name="name"
										autocomplete="off"
										placeholder="Veterinary"
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
								{$creating ? 'Adding…' : 'Add vertical'}
							</Modal.Action>
						</Modal.Footer>
					</form>
				</Modal.Content>
			</Modal.Root>
		</PageHeader.Actions>
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="industry" nounPlural="industries" />
	</DataTable.Root>
</div>
