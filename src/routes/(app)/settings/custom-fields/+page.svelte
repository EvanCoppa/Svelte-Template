<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TablePropertiesIcon from '@lucide/svelte/icons/table-properties';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as CustomFields from '$lib/components/custom-fields/index.js';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { allowedValues } from '$lib/crm/custom-fields';
	import { isRecordKind, recordTerms } from '$lib/crm/records';
	import { QUERY } from '$lib/queries';
	import type { CustomFieldDefinition } from '$lib/server/crm/custom-fields';
	import { capitalize } from '$lib/utils.js';
	import { createCustomFieldSchema, updateCustomFieldSchema, VALUE_TYPE_OPTIONS } from './schema';

	let { data } = $props();

	/** Each kind as the org's industry names it: "Patients" in a practice. */
	const kindOptions = $derived(
		data.kinds.map((kind) => ({
			value: kind,
			label: capitalize(recordTerms(page.data.terms, kind).plural)
		}))
	);
	/**
	 * A kind as the industry names it. The load only ships definitions for kinds
	 * this session can open, so the guard always passes here — it is what keeps
	 * the narrowing honest instead of casting `crm_entity_type` down.
	 */
	const kindLabel = (kind: string) =>
		isRecordKind(kind) ? capitalize(recordTerms(page.data.terms, kind).plural) : kind;

	const typeLabel = (valueType: string) =>
		VALUE_TYPE_OPTIONS.find((option) => option.value === valueType)?.label ?? valueType;

	/** Which kind's fields the table is showing. A page of one table, filtered. */
	let shownKind = $state<string>(data.kinds[0] ?? '');
	const rows = $derived(data.definitions.filter((row) => row.entity_type === shownKind));

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, CustomFieldDefinition>();
	const columns = $derived.by(() => {
		const defs = columnHelper.columns([
			columnHelper.accessor('label', {
				header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Label' })
			}),
			columnHelper.accessor('key', {
				header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Key' }),
				cell: ({ getValue }) => getValue()
			}),
			columnHelper.accessor((row) => typeLabel(row.value_type), {
				id: 'value_type',
				header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Type' })
			}),
			columnHelper.accessor((row) => allowedValues(row.allowed_values)?.join(', ') ?? '', {
				id: 'choices',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Choices' }),
				enableSorting: false
			}),
			DataTable.actionsColumn(columnHelper, ({ row }) =>
				renderComponent(CustomFields.RowActions, {
					label: row.original.label,
					canManage: data.canManage,
					onEdit: () => startEditing(row.original),
					onDelete: () => (removingId = row.original.id)
				})
			)
		]);
		return data.canManage ? defs : defs.filter((def) => def.id !== 'actions');
	});

	const table = createTable({
		features: DataTable.features,
		get data() {
			return rows;
		},
		get columns() {
			return columns;
		}
	});

	let createOpen = $state(false);
	/** The two per-field dialogs address a field by id: a save reloads the list under them. */
	let editingId = $state<string | null>(null);
	let removingId = $state<string | null>(null);
	const removing = $derived(data.definitions.find((row) => row.id === removingId) ?? null);

	const {
		form: createData,
		errors: createErrors,
		message: createMessage,
		constraints: createConstraints,
		submitting: creating,
		enhance: createEnhance
	} = superForm(data.createForm, {
		id: 'create-custom-field',
		validators: zod4Client(createCustomFieldSchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			createOpen = false;
			toast.success('Custom field added');
			invalidate(QUERY.customFields);
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
		id: 'update-custom-field',
		validators: zod4Client(updateCustomFieldSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			editingId = null;
			toast.success('Custom field saved');
			invalidate(QUERY.customFields);
		}
	});

	/** The field being edited, for the parts of the dialog the form does not carry. */
	const editing = $derived(data.definitions.find((row) => row.id === editingId) ?? null);

	function startEditing(definition: CustomFieldDefinition) {
		$editData = {
			id: definition.id,
			key: definition.key,
			label: definition.label,
			allowed_values: allowedValues(definition.allowed_values)?.join(', ') ?? ''
		};
		editingId = definition.id;
	}

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(data.removeForm, {
		id: 'delete-custom-field',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingId = null;
			toast.success('Custom field removed');
			invalidate(QUERY.customFields);
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
								Add field
							</Button>
						{/snippet}
					</Modal.Trigger>
					<Modal.Content>
						<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
						<form method="POST" action="?/create" use:createEnhance>
							<Modal.Card>
								<Modal.Header>
									<Modal.Title><TablePropertiesIcon /> New custom field</Modal.Title>
									<Modal.Description>
										An extra attribute your organization keeps on one kind of record. It shows on
										every record of that kind, and only for this organization.
									</Modal.Description>
								</Modal.Header>
								<Modal.Body>
									<FormAlert message={$createMessage} class="mb-0" />
									<div class="grid gap-2">
										<Label for="create-custom-field-entity">Applies to</Label>
										<Combobox
											id="create-custom-field-entity"
											name="entity_type"
											options={kindOptions}
											bind:value={$createData.entity_type}
											placeholder="Pick a kind of record…"
											invalid={Boolean($createErrors.entity_type)}
										/>
										{#if $createErrors.entity_type}
											<p class="text-destructive text-sm">{$createErrors.entity_type}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label for="create-custom-field-label">Label</Label>
										<Input
											id="create-custom-field-label"
											name="label"
											placeholder="Preferred channel"
											aria-invalid={$createErrors.label ? 'true' : undefined}
											bind:value={$createData.label}
											{...$createConstraints.label}
										/>
										{#if $createErrors.label}
											<p class="text-destructive text-sm">{$createErrors.label}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label for="create-custom-field-key">Key</Label>
										<Input
											id="create-custom-field-key"
											name="key"
											placeholder="preferred_channel"
											aria-invalid={$createErrors.key ? 'true' : undefined}
											bind:value={$createData.key}
											{...$createConstraints.key}
										/>
										<p class="text-muted-foreground text-sm">
											The stable name imports and reports use. It cannot clash with another field on
											the same kind.
										</p>
										{#if $createErrors.key}
											<p class="text-destructive text-sm">{$createErrors.key}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label for="create-custom-field-type">Type</Label>
										<Combobox
											id="create-custom-field-type"
											name="value_type"
											options={VALUE_TYPE_OPTIONS}
											bind:value={$createData.value_type}
											invalid={Boolean($createErrors.value_type)}
										/>
										<p class="text-muted-foreground text-sm">
											Fixed once the field holds a value anywhere.
										</p>
										{#if $createErrors.value_type}
											<p class="text-destructive text-sm">{$createErrors.value_type}</p>
										{/if}
									</div>
									{#if $createData.value_type === 'select'}
										<div class="grid gap-2">
											<Label for="create-custom-field-choices">Choices</Label>
											<Input
												id="create-custom-field-choices"
												name="allowed_values"
												placeholder="email, phone, text"
												aria-invalid={$createErrors.allowed_values ? 'true' : undefined}
												bind:value={$createData.allowed_values}
												{...$createConstraints.allowed_values}
											/>
											<p class="text-muted-foreground text-sm">Separated by commas.</p>
											{#if $createErrors.allowed_values}
												<p class="text-destructive text-sm">{$createErrors.allowed_values}</p>
											{/if}
										</div>
									{/if}
								</Modal.Body>
							</Modal.Card>
							<Modal.Footer>
								<Modal.Cancel>Cancel</Modal.Cancel>
								<Modal.Action type="submit" disabled={$creating}>
									{$creating ? 'Adding…' : 'Add field'}
								</Modal.Action>
							</Modal.Footer>
						</form>
					</Modal.Content>
				</Modal.Root>
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	{#if data.kinds.length > 0}
		<div class="flex items-center gap-2">
			<Label for="custom-fields-kind" class="text-muted-foreground">Applies to</Label>
			<Combobox id="custom-fields-kind" options={kindOptions} bind:value={shownKind} class="w-56" />
		</div>

		<DataTable.Root {table}>
			<DataTable.Content emptyMessage="No custom fields on this kind of record yet." />
			<DataTable.Pagination noun="custom field" nounPlural="custom fields" />
		</DataTable.Root>
	{/if}
</div>

<!-- Edit — the key, the label and a choice list; never the type or the kind. -->
<Modal.Root
	open={editingId !== null}
	onOpenChange={(open) => {
		if (!open) editingId = null;
	}}
>
	<Modal.Content>
		{#if editing}
			<form method="POST" action="?/update" use:editEnhance>
				<input type="hidden" name="id" value={$editData.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><TablePropertiesIcon /> Edit {editing.label}</Modal.Title>
						<Modal.Description>
							{typeLabel(editing.value_type)} on {kindLabel(editing.entity_type)}. The type and the
							kind of record are fixed once the field holds a value.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$editMessage} class="mb-0" />
						<div class="grid gap-2">
							<Label for="edit-custom-field-label">Label</Label>
							<Input
								id="edit-custom-field-label"
								name="label"
								aria-invalid={$editErrors.label ? 'true' : undefined}
								bind:value={$editData.label}
								{...$editConstraints.label}
							/>
							{#if $editErrors.label}
								<p class="text-destructive text-sm">{$editErrors.label}</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="edit-custom-field-key">Key</Label>
							<Input
								id="edit-custom-field-key"
								name="key"
								aria-invalid={$editErrors.key ? 'true' : undefined}
								bind:value={$editData.key}
								{...$editConstraints.key}
							/>
							{#if $editErrors.key}
								<p class="text-destructive text-sm">{$editErrors.key}</p>
							{/if}
						</div>
						{#if editing.value_type === 'select'}
							<div class="grid gap-2">
								<Label for="edit-custom-field-choices">Choices</Label>
								<Input
									id="edit-custom-field-choices"
									name="allowed_values"
									aria-invalid={$editErrors.allowed_values ? 'true' : undefined}
									bind:value={$editData.allowed_values}
									{...$editConstraints.allowed_values}
								/>
								<p class="text-muted-foreground text-sm">
									Separated by commas. A choice a record already holds cannot be removed.
								</p>
								{#if $editErrors.allowed_values}
									<p class="text-destructive text-sm">{$editErrors.allowed_values}</p>
								{/if}
							</div>
						{/if}
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$saving}>
						{$saving ? 'Saving…' : 'Save changes'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
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
						<Modal.Title><Trash2Icon /> Remove {removing.label}?</Modal.Title>
						<Modal.Description>
							The field goes from every {kindLabel(removing.entity_type).toLowerCase()}
							record, and every value stored in it is deleted.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" disabled={$deleting}>
						{$deleting ? 'Removing…' : 'Remove'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
