<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import StarIcon from '@lucide/svelte/icons/star';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import RowActions from '$lib/components/row-actions.svelte';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { featureTerms } from '$lib/features/terms';
	import { QUERY } from '$lib/queries';
	import type { FeaturedGroupWithProducts } from '$lib/server/crm/featured-groups';
	import { capitalize } from '$lib/utils.js';
	import { createFeaturedGroupSchema, updateFeaturedGroupSchema } from './schema';

	let { data } = $props();

	// "Featured groups" by default, "Featured lineups" to a distributor of
	// drinks; and what they shelve.
	const terms = $derived(featureTerms(page.data.terms, 'featured-groups'));
	const productTerms = $derived(recordTerms(page.data.terms, 'product'));

	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	/** Every live product, as the pickers offer it: the SKU under the name, the price on the right. */
	const productOptions = $derived<ComboboxOption[]>(
		data.products.map((product) => ({
			value: product.id,
			label: product.name,
			sublabel: product.sku ?? undefined,
			hint: money(product.unit_price, product.currency)
		}))
	);

	function members(group: FeaturedGroupWithProducts): string {
		return group.featured_group_products.map((row) => row.products.name).join(', ');
	}

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, FeaturedGroupWithProducts>();
	const columns = $derived.by(() => {
		const defs = columnHelper.columns([
			DataTable.selectColumn(columnHelper),
			columnHelper.accessor('name', {
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: capitalize(terms.noun) }),
				enableGlobalFilter: true,
				meta: { title: capitalize(terms.noun) }
			}),
			columnHelper.accessor((group) => group.featured_group_products.length, {
				id: 'count',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, {
						column,
						title: capitalize(productTerms.plural)
					}),
				enableGlobalFilter: false,
				filterFn: 'oneOf',
				meta: { title: capitalize(productTerms.plural), filter: { options: null } }
			}),
			columnHelper.accessor(members, {
				id: 'members',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Includes' }),
				enableSorting: false,
				enableGlobalFilter: true,
				meta: { title: 'Includes' }
			}),
			columnHelper.accessor((group) => (group.is_active ? 'Active' : 'Inactive'), {
				id: 'status',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
				enableGlobalFilter: false,
				filterFn: 'oneOf',
				meta: { title: 'Status', filter: { options: null } }
			}),
			DataTable.actionsColumn(columnHelper, ({ row }) =>
				renderComponent(RowActions, {
					name: row.original.name,
					canEdit: data.canManage,
					canDelete: data.canDelete,
					onEdit: () => startEditing(row.original),
					onDelete: () => (removingId = row.original.id)
				})
			)
		]);
		if (data.canManage || data.canDelete) return defs;
		return defs.filter((def) => def.id !== 'actions');
	});

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.featuredGroups;
		},
		get columns() {
			return columns;
		}
	});

	const STATUS_OPTIONS: ComboboxOption[] = [
		{ value: 'true', label: 'Active' },
		{ value: 'false', label: 'Inactive' }
	];

	let createOpen = $state(false);
	/**
	 * The two per-group dialogs address a group by id, not by a copied row: a
	 * save reloads the list underneath them.
	 */
	let editingId = $state<string | null>(null);
	let removingId = $state<string | null>(null);
	const removing = $derived(data.featuredGroups.find((group) => group.id === removingId) ?? null);

	const {
		form: createData,
		errors: createErrors,
		message: createMessage,
		constraints: createConstraints,
		submitting: creating,
		enhance: createEnhance
	} = superForm(data.createForm, {
		id: 'create-featured-group',
		validators: zod4Client(createFeaturedGroupSchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			createOpen = false;
			toast.success(`${capitalize(terms.noun)} created`);
			invalidate(QUERY.featuredGroups);
		}
	});

	const {
		form: editData,
		errors: editErrors,
		message: editMessage,
		constraints: editConstraints,
		submitting: saving,
		enhance: editEnhance
	} = superForm(data.updateForm, {
		id: 'update-featured-group',
		validators: zod4Client(updateFeaturedGroupSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			editingId = null;
			toast.success(`${capitalize(terms.noun)} saved`);
			invalidate(QUERY.featuredGroups);
		}
	});

	/** Open the edit dialog on a group, with its current name and members filled in. */
	function startEditing(group: FeaturedGroupWithProducts) {
		$editData = {
			id: group.id,
			name: group.name,
			description: group.description ?? '',
			is_active: group.is_active ? 'true' : 'false',
			product_ids: group.featured_group_products.map((row) => row.products.id)
		};
		editingId = group.id;
	}

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(data.removeForm, {
		id: 'delete-featured-group',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingId = null;
			toast.success(`${capitalize(terms.noun)} deleted`);
			invalidate(QUERY.featuredGroups);
		}
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canManage}
			<PageHeader.Actions>
				<Modal.Root bind:open={createOpen}>
					<Modal.Trigger>
						{#snippet child({ props })}
							<Button {...props}>
								<PlusIcon />
								Add {terms.noun}
							</Button>
						{/snippet}
					</Modal.Trigger>
					<Modal.Content>
						<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
						<form method="POST" action="?/create" use:createEnhance>
							<Modal.Card>
								<Modal.Header>
									<Modal.Title><StarIcon /> New {terms.noun}</Modal.Title>
									<Modal.Description>
										These {productTerms.plural} are shown together, ahead of the rest of the catalog.
									</Modal.Description>
								</Modal.Header>
								<Modal.Body>
									<FormAlert message={$createMessage} class="mb-0" />
									<div class="grid gap-2">
										<Label for="create-featured-group-name">Name</Label>
										<Input
											id="create-featured-group-name"
											name="name"
											placeholder="Spring promo"
											aria-invalid={$createErrors.name ? 'true' : undefined}
											bind:value={$createData.name}
											{...$createConstraints.name}
										/>
										{#if $createErrors.name}
											<p class="text-destructive text-sm">{$createErrors.name}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label for="create-featured-group-products">
											{capitalize(productTerms.plural)}
										</Label>
										<Combobox
											id="create-featured-group-products"
											name="product_ids"
											multiple
											options={productOptions}
											bind:selected={$createData.product_ids}
											placeholder="Pick {productTerms.plural}…"
											searchPlaceholder="Search by name or SKU…"
											emptyText="No active {productTerms.plural} yet"
											invalid={Boolean($createErrors.product_ids?._errors)}
										/>
										{#if $createErrors.product_ids?._errors}
											<p class="text-destructive text-sm">{$createErrors.product_ids._errors}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label for="create-featured-group-status">Status</Label>
										<Combobox
											id="create-featured-group-status"
											name="is_active"
											options={STATUS_OPTIONS}
											bind:value={$createData.is_active}
										/>
									</div>
									<div class="grid gap-2">
										<Label for="create-featured-group-description">Description</Label>
										<Textarea
											id="create-featured-group-description"
											name="description"
											placeholder="What this group is for"
											aria-invalid={$createErrors.description ? 'true' : undefined}
											bind:value={$createData.description}
											{...$createConstraints.description}
										/>
										{#if $createErrors.description}
											<p class="text-destructive text-sm">{$createErrors.description}</p>
										{/if}
									</div>
								</Modal.Body>
							</Modal.Card>
							<Modal.Footer>
								<Modal.Cancel>Cancel</Modal.Cancel>
								<Modal.Action type="submit" disabled={$creating}>
									{$creating ? 'Creating…' : `Create ${terms.noun}`}
								</Modal.Action>
							</Modal.Footer>
						</form>
					</Modal.Content>
				</Modal.Root>
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Toolbar>
			<DataTable.Search placeholder="Search {terms.plural}…" ariaLabel="Search {terms.plural}" />
			<DataTable.Filters />
			<DataTable.ViewOptions class="ms-auto" />
		</DataTable.Toolbar>
		<DataTable.Content emptyMessage="No {terms.plural} match." />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>

<!-- Edit — the row menu's first action. -->
<Modal.Root
	open={editingId !== null}
	onOpenChange={(open) => {
		if (!open) editingId = null;
	}}
>
	<Modal.Content>
		<form method="POST" action="?/update" use:editEnhance>
			<input type="hidden" name="id" value={$editData.id} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><StarIcon /> Edit {terms.noun}</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$editMessage} class="mb-0" />
					<div class="grid gap-2">
						<Label for="edit-featured-group-name">Name</Label>
						<Input
							id="edit-featured-group-name"
							name="name"
							aria-invalid={$editErrors.name ? 'true' : undefined}
							bind:value={$editData.name}
							{...$editConstraints.name}
						/>
						{#if $editErrors.name}
							<p class="text-destructive text-sm">{$editErrors.name}</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="edit-featured-group-products">{capitalize(productTerms.plural)}</Label>
						<Combobox
							id="edit-featured-group-products"
							name="product_ids"
							multiple
							options={productOptions}
							bind:selected={$editData.product_ids}
							placeholder="Pick {productTerms.plural}…"
							searchPlaceholder="Search by name or SKU…"
							invalid={Boolean($editErrors.product_ids?._errors)}
						/>
						{#if $editErrors.product_ids?._errors}
							<p class="text-destructive text-sm">{$editErrors.product_ids._errors}</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="edit-featured-group-status">Status</Label>
						<Combobox
							id="edit-featured-group-status"
							name="is_active"
							options={STATUS_OPTIONS}
							bind:value={$editData.is_active}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="edit-featured-group-description">Description</Label>
						<Textarea
							id="edit-featured-group-description"
							name="description"
							aria-invalid={$editErrors.description ? 'true' : undefined}
							bind:value={$editData.description}
							{...$editConstraints.description}
						/>
						{#if $editErrors.description}
							<p class="text-destructive text-sm">{$editErrors.description}</p>
						{/if}
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$saving}>
					{$saving ? 'Saving…' : 'Save changes'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Delete — the one destructive act the page offers. -->
<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Modal.Content>
		{#if removing}
			<form method="POST" action="?/remove" use:removeEnhance>
				<input type="hidden" name="id" value={removing.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Delete {removing.name}?</Modal.Title>
						<Modal.Description>
							The {terms.noun} goes; the {productTerms.plural} it shelved stay in the catalog.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" disabled={$deleting}>
						{$deleting ? 'Deleting…' : 'Delete'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
