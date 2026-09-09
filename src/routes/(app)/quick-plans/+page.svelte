<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as QuickPlans from './components/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { featureTerms } from '$lib/features/terms';
	import { QUERY } from '$lib/queries';
	import type { QuickPlanWithBillables } from '$lib/server/crm/quick-plans';
	import { capitalize } from '$lib/utils.js';
	import { createQuickPlanSchema, updateQuickPlanSchema } from './schema';

	let { data } = $props();

	// "Quick plans" in a practice, "Packages" on a roof; and what they bundle.
	const terms = $derived(featureTerms(page.data.terms, 'quick-plans'));
	const billableTerms = $derived(recordTerms(page.data.terms, 'billable'));

	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	/** Every live billable, as the pickers offer it: the code under the name, the price on the right. */
	const billableOptions = $derived<ComboboxOption[]>(
		data.billables.map((billable) => ({
			value: billable.id,
			label: billable.name,
			sublabel: billable.code ?? undefined,
			hint: money(billable.unit_price, billable.currency)
		}))
	);

	function members(plan: QuickPlanWithBillables): string {
		return plan.quick_plan_billables.map((row) => row.billables.name).join(', ');
	}

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, QuickPlanWithBillables>();
	const columns = $derived.by(() => {
		const defs = columnHelper.columns([
			DataTable.selectColumn(columnHelper),
			columnHelper.accessor('name', {
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: capitalize(terms.noun) })
			}),
			columnHelper.accessor((plan) => plan.quick_plan_billables.length, {
				id: 'count',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, {
						column,
						title: capitalize(billableTerms.plural)
					})
			}),
			columnHelper.accessor(members, {
				id: 'members',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Includes' }),
				enableSorting: false
			}),
			DataTable.actionsColumn(columnHelper, ({ row }) =>
				renderComponent(QuickPlans.RowActions, {
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
			return data.quickPlans;
		},
		get columns() {
			return columns;
		}
	});

	let createOpen = $state(false);
	/**
	 * The two per-bundle dialogs address a bundle by id, not by a copied row: a
	 * save reloads the list underneath them.
	 */
	let editingId = $state<string | null>(null);
	let removingId = $state<string | null>(null);
	const removing = $derived(data.quickPlans.find((plan) => plan.id === removingId) ?? null);

	const {
		form: createData,
		errors: createErrors,
		message: createMessage,
		constraints: createConstraints,
		submitting: creating,
		enhance: createEnhance
	} = superForm(data.createForm, {
		id: 'create-quick-plan',
		validators: zod4Client(createQuickPlanSchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			createOpen = false;
			toast.success(`${capitalize(terms.noun)} created`);
			invalidate(QUERY.quickPlans);
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
		id: 'update-quick-plan',
		validators: zod4Client(updateQuickPlanSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			editingId = null;
			toast.success(`${capitalize(terms.noun)} saved`);
			invalidate(QUERY.quickPlans);
		}
	});

	/** Open the edit dialog on a bundle, with its current name and members filled in. */
	function startEditing(plan: QuickPlanWithBillables) {
		$editData = {
			id: plan.id,
			name: plan.name,
			billable_ids: plan.quick_plan_billables.map((row) => row.billables.id)
		};
		editingId = plan.id;
	}

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(data.removeForm, {
		id: 'delete-quick-plan',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingId = null;
			toast.success(`${capitalize(terms.noun)} deleted`);
			invalidate(QUERY.quickPlans);
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
									<Modal.Title><LayersIcon /> New {terms.noun}</Modal.Title>
									<Modal.Description>
										Picking a {terms.noun} on a proposal option fills it with these {billableTerms.plural}
										in one click.
									</Modal.Description>
								</Modal.Header>
								<Modal.Body>
									<FormAlert message={$createMessage} class="mb-0" />
									<div class="grid gap-2">
										<Label for="create-quick-plan-name">Name</Label>
										<Input
											id="create-quick-plan-name"
											name="name"
											placeholder="Crown and whitening"
											aria-invalid={$createErrors.name ? 'true' : undefined}
											bind:value={$createData.name}
											{...$createConstraints.name}
										/>
										{#if $createErrors.name}
											<p class="text-destructive text-sm">{$createErrors.name}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label for="create-quick-plan-billables"
											>{capitalize(billableTerms.plural)}</Label
										>
										<Combobox
											id="create-quick-plan-billables"
											name="billable_ids"
											multiple
											options={billableOptions}
											bind:selected={$createData.billable_ids}
											placeholder="Pick {billableTerms.plural}…"
											searchPlaceholder="Search by name or code…"
											emptyText="No active {billableTerms.plural} yet"
											invalid={Boolean($createErrors.billable_ids?._errors)}
										/>
										{#if $createErrors.billable_ids?._errors}
											<p class="text-destructive text-sm">{$createErrors.billable_ids._errors}</p>
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
		<DataTable.Content emptyMessage="No {terms.plural} yet." />
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
					<Modal.Title><LayersIcon /> Edit {terms.noun}</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$editMessage} class="mb-0" />
					<div class="grid gap-2">
						<Label for="edit-quick-plan-name">Name</Label>
						<Input
							id="edit-quick-plan-name"
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
						<Label for="edit-quick-plan-billables">{capitalize(billableTerms.plural)}</Label>
						<Combobox
							id="edit-quick-plan-billables"
							name="billable_ids"
							multiple
							options={billableOptions}
							bind:selected={$editData.billable_ids}
							placeholder="Pick {billableTerms.plural}…"
							searchPlaceholder="Search by name or code…"
							invalid={Boolean($editErrors.billable_ids?._errors)}
						/>
						{#if $editErrors.billable_ids?._errors}
							<p class="text-destructive text-sm">{$editErrors.billable_ids._errors}</p>
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
							The {terms.noun} goes; the {billableTerms.plural} it bundled stay, and so does every proposal
							built from it.
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
