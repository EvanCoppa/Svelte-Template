<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PackageCheckIcon from '@lucide/svelte/icons/package-check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ShoppingBagIcon from '@lucide/svelte/icons/shopping-bag';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import EditRecord from '$lib/components/edit-record.svelte';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { PURCHASE_STATUS_TONE } from '$lib/crm/tones';
	import { QUERY } from '$lib/queries';
	import { capitalize } from '$lib/utils.js';
	import {
		purchaseLineSchema,
		receivePurchaseLineSchema,
		updatePurchaseLineSchema
	} from './schema';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'purchase'));
	const productTerms = $derived(recordTerms(page.data.terms, 'product'));

	const money = (value: number | null, currency: string) =>
		value === null
			? '—'
			: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	const when = (value: string | null) =>
		value === null
			? '—'
			: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));

	const lines = $derived(data.purchase.purchase_line_items);
	const currency = $derived(data.purchase.currency);

	/** Every live product a line can cite. The citation is provenance: the line keeps its own cost. */
	const productOptions = $derived<ComboboxOption[]>([
		{ value: '', label: `No ${productTerms.noun} — a one-off line` },
		...data.products.map((product) => ({
			value: product.id,
			label: product.name,
			sublabel: product.sku ?? undefined
		}))
	]);

	let addOpen = $state(false);
	let editingLineId = $state<string | null>(null);
	let removingLineId = $state<string | null>(null);
	let cancelOpen = $state(false);
	const removingLine = $derived(lines.find((line) => line.id === removingLineId) ?? null);

	const refresh = () => {
		invalidate(QUERY.record('purchase', data.purchase.id));
		invalidate(QUERY.purchases);
	};

	const {
		form: addData,
		errors: addErrors,
		message: addMessage,
		submitting: adding,
		enhance: addEnhance
	} = superForm(data.addLineForm, {
		id: 'add-purchase-line',
		validators: zod4Client(purchaseLineSchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			addOpen = false;
			toast.success('Line added');
			refresh();
		}
	});

	const {
		form: editLineData,
		errors: editLineErrors,
		message: editLineMessage,
		submitting: savingLine,
		enhance: editLineEnhance
	} = superForm(data.updateLineForm, {
		id: 'update-purchase-line',
		validators: zod4Client(updatePurchaseLineSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			editingLineId = null;
			toast.success('Line saved');
			refresh();
		}
	});

	function startEditingLine(line: (typeof lines)[number]) {
		$editLineData = {
			id: line.id,
			product_id: line.product_id ?? '',
			description: line.description,
			product_sku_snapshot: line.product_sku_snapshot ?? '',
			quantity_ordered: String(line.quantity_ordered),
			unit_cost: String(line.unit_cost),
			freight_allocation: String(line.freight_allocation)
		};
		editingLineId = line.id;
	}

	const {
		form: receiveData,
		message: receiveMessage,
		submitting: receiving,
		enhance: receiveEnhance
	} = superForm(data.receiveForm, {
		id: 'receive-purchase-line',
		validators: zod4Client(receivePurchaseLineSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			// The header's status moved with it, by trigger — so the whole
			// record is re-read rather than just the line.
			toast.success('Recorded what arrived');
			refresh();
		}
	});

	const {
		message: removeLineMessage,
		submitting: removingBusy,
		enhance: removeLineEnhance
	} = superForm(data.removeLineForm, {
		id: 'remove-purchase-line',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingLineId = null;
			toast.success('Line removed');
			refresh();
		}
	});

	const {
		message: actMessage,
		submitting: acting,
		enhance: actEnhance
	} = superForm(data.actForm, {
		id: 'place-purchase',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			cancelOpen = false;
			toast.success('Order updated');
			refresh();
		}
	});
</script>

<div class="space-y-6">
	<!-- The way back, what it is, and what can be done to it. -->
	<PageHeader.Root>
		<div class="flex min-w-0 items-center gap-3">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button {...props} href="/purchases" variant="ghost" size="icon" class="shrink-0">
							<ArrowLeftIcon />
							<span class="sr-only">All {terms.plural}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>All {terms.plural}</Tooltip.Content>
			</Tooltip.Root>
			<div class="min-w-0">
				<p class="text-muted-foreground text-xs">
					{#if data.purchase.companies}
						{#if data.canOpenVendor}
							<a href="/companies/{data.purchase.companies.id}" class="hover:underline">
								{data.purchase.companies.name}
							</a>
						{:else}
							{data.purchase.companies.name}
						{/if}
					{/if}
				</p>
				<div class="flex items-center gap-2">
					<PageHeader.Title>{data.purchase.number}</PageHeader.Title>
					<StatusBadge tone={PURCHASE_STATUS_TONE[data.purchase.status]}>
						{data.purchase.status.replace('_', ' ')}
					</StatusBadge>
				</div>
			</div>
		</div>
		<PageHeader.Actions>
			{#if data.edit}
				<EditRecord
					type="purchase"
					recordId={data.purchase.id}
					form={data.edit.editForm}
					pickers={data.edit.editPickers}
				/>
			{/if}
			{#if data.canPlace}
				<form method="POST" action="?/place" use:actEnhance>
					<Button type="submit" disabled={$acting}>
						{$acting ? 'Placing…' : 'Place order'}
					</Button>
				</form>
			{/if}
			{#if data.canCancel}
				<Button variant="outline" onclick={() => (cancelOpen = true)}>Cancel order</Button>
			{/if}
		</PageHeader.Actions>
	</PageHeader.Root>

	<FormAlert message={$actMessage} />

	<!-- What it adds up to. Every figure is the database's: the subtotal rolls
	     up from the lines and the total is generated from it. -->
	<Card.Root>
		<Card.Content class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each [['Subtotal', data.purchase.subtotal], ['Freight', data.purchase.freight], ['Tax', data.purchase.tax], ['Total', data.purchase.total]] as [label, value] (label)}
				<div>
					<p class="text-muted-foreground text-xs">{label}</p>
					<p class="text-lg tabular-nums">{money(value as number | null, currency)}</p>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each [['Ordered', data.purchase.ordered_at], ['Expected', data.purchase.expected_at], ['Received', data.purchase.received_at]] as [label, value] (label)}
			<Card.Root>
				<Card.Content>
					<p class="text-muted-foreground text-xs">{label}</p>
					<p class="text-sm">{when(value as string | null)}</p>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<!-- The lines, and what has arrived against each. -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Lines</Card.Title>
			<Card.Description>
				What was ordered, and how much of it is in. The order's state follows what has arrived — it
				is never set by hand.
			</Card.Description>
			{#if data.linesEditable}
				<Card.Action>
					<Button size="sm" onclick={() => (addOpen = true)}>
						<PlusIcon />
						Add line
					</Button>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="p-0">
			{#if lines.length === 0}
				<Empty.Root class="py-10">
					<Empty.Media variant="icon"><ShoppingBagIcon /></Empty.Media>
					<Empty.Title>Nothing on this order yet</Empty.Title>
					<Empty.Description>Add what you are buying, then place the order.</Empty.Description>
				</Empty.Root>
			{:else}
				<ul class="divide-border divide-y">
					{#each lines as line (line.id)}
						<li class="space-y-2 px-6 py-4">
							<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
								<span class="font-medium">{line.description}</span>
								{#if line.product_sku_snapshot}
									<span class="text-muted-foreground text-xs">{line.product_sku_snapshot}</span>
								{/if}
								<span class="text-muted-foreground ms-auto text-sm tabular-nums">
									{line.quantity_ordered} × {money(line.unit_cost, currency)} =
									{money(line.line_total, currency)}
								</span>
							</div>
							<div class="flex flex-wrap items-center gap-3">
								<span class="text-muted-foreground text-sm tabular-nums">
									{line.quantity_received} of {line.quantity_ordered} received
								</span>
								{#if line.landed_unit_cost !== null}
									<span class="text-muted-foreground text-xs">
										landed {money(line.landed_unit_cost, currency)}/unit
									</span>
								{/if}
								{#if data.linesEditable}
									<form
										method="POST"
										action="?/receiveLine"
										use:receiveEnhance
										class="ms-auto flex items-center gap-2"
									>
										<input type="hidden" name="id" value={line.id} />
										<Label class="sr-only" for="receive-{line.id}">Received</Label>
										<Input
											id="receive-{line.id}"
											name="quantity_received"
											inputmode="decimal"
											class="h-8 w-24"
											value={String(line.quantity_received)}
											onfocus={() => ($receiveData.id = line.id)}
										/>
										<Button type="submit" size="sm" variant="outline" disabled={$receiving}>
											<PackageCheckIcon />
											Receive
										</Button>
									</form>
									<Button size="sm" variant="ghost" onclick={() => startEditingLine(line)}>
										Edit
									</Button>
									<Button size="sm" variant="ghost" onclick={() => (removingLineId = line.id)}>
										<Trash2Icon />
										<span class="sr-only">Remove {line.description}</span>
									</Button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			<FormAlert message={$receiveMessage} class="mx-6 mb-4" />
		</Card.Content>
	</Card.Root>

	{#if data.purchase.notes}
		<Card.Root>
			<Card.Header><Card.Title>Notes</Card.Title></Card.Header>
			<Card.Content><p class="text-sm whitespace-pre-wrap">{data.purchase.notes}</p></Card.Content>
		</Card.Root>
	{/if}
</div>

<!-- Add a line. -->
<Modal.Root bind:open={addOpen}>
	<Modal.Content>
		<form method="POST" action="?/addLine" use:addEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><PlusIcon /> Add a line</Modal.Title>
					<Modal.Description>
						Citing a {productTerms.noun} records where the line came from; the line keeps its own description
						and cost, so repricing the catalog never rewrites this order.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$addMessage} class="mb-0" />
					<div class="grid gap-2">
						<Label for="add-line-product">{capitalize(productTerms.noun)}</Label>
						<Combobox
							id="add-line-product"
							name="product_id"
							options={productOptions}
							bind:value={$addData.product_id}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="add-line-description">Description</Label>
						<Input
							id="add-line-description"
							name="description"
							placeholder="Nitrile gloves, box of 100"
							aria-invalid={$addErrors.description ? 'true' : undefined}
							bind:value={$addData.description}
						/>
						{#if $addErrors.description}
							<p class="text-destructive text-sm">{$addErrors.description}</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="add-line-sku">SKU</Label>
						<Input
							id="add-line-sku"
							name="product_sku_snapshot"
							bind:value={$addData.product_sku_snapshot}
						/>
					</div>
					<div class="grid gap-2 sm:grid-cols-3">
						<div class="grid gap-2">
							<Label for="add-line-qty">Quantity</Label>
							<Input
								id="add-line-qty"
								name="quantity_ordered"
								inputmode="decimal"
								aria-invalid={$addErrors.quantity_ordered ? 'true' : undefined}
								bind:value={$addData.quantity_ordered}
							/>
							{#if $addErrors.quantity_ordered}
								<p class="text-destructive text-sm">{$addErrors.quantity_ordered}</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="add-line-cost">Unit cost</Label>
							<Input
								id="add-line-cost"
								name="unit_cost"
								inputmode="decimal"
								bind:value={$addData.unit_cost}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="add-line-freight">Freight</Label>
							<Input
								id="add-line-freight"
								name="freight_allocation"
								inputmode="decimal"
								bind:value={$addData.freight_allocation}
							/>
						</div>
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$adding}>
					{$adding ? 'Adding…' : 'Add line'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Edit a line. -->
<Modal.Root
	open={editingLineId !== null}
	onOpenChange={(open) => {
		if (!open) editingLineId = null;
	}}
>
	<Modal.Content>
		<form method="POST" action="?/updateLine" use:editLineEnhance>
			<input type="hidden" name="id" value={$editLineData.id} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><ShoppingBagIcon /> Edit line</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$editLineMessage} class="mb-0" />
					<div class="grid gap-2">
						<Label for="edit-line-product">{capitalize(productTerms.noun)}</Label>
						<Combobox
							id="edit-line-product"
							name="product_id"
							options={productOptions}
							bind:value={$editLineData.product_id}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="edit-line-description">Description</Label>
						<Input
							id="edit-line-description"
							name="description"
							aria-invalid={$editLineErrors.description ? 'true' : undefined}
							bind:value={$editLineData.description}
						/>
						{#if $editLineErrors.description}
							<p class="text-destructive text-sm">{$editLineErrors.description}</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="edit-line-sku">SKU</Label>
						<Input
							id="edit-line-sku"
							name="product_sku_snapshot"
							bind:value={$editLineData.product_sku_snapshot}
						/>
					</div>
					<div class="grid gap-2 sm:grid-cols-3">
						<div class="grid gap-2">
							<Label for="edit-line-qty">Quantity</Label>
							<Input
								id="edit-line-qty"
								name="quantity_ordered"
								inputmode="decimal"
								bind:value={$editLineData.quantity_ordered}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="edit-line-cost">Unit cost</Label>
							<Input
								id="edit-line-cost"
								name="unit_cost"
								inputmode="decimal"
								bind:value={$editLineData.unit_cost}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="edit-line-freight">Freight</Label>
							<Input
								id="edit-line-freight"
								name="freight_allocation"
								inputmode="decimal"
								bind:value={$editLineData.freight_allocation}
							/>
						</div>
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$savingLine}>
					{$savingLine ? 'Saving…' : 'Save line'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Remove a line. -->
<Modal.Root
	open={removingLine !== null}
	onOpenChange={(open) => {
		if (!open) removingLineId = null;
	}}
>
	<Modal.Content>
		{#if removingLine}
			<form method="POST" action="?/removeLine" use:removeLineEnhance>
				<input type="hidden" name="id" value={removingLine.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Remove this line?</Modal.Title>
						<Modal.Description>
							{removingLine.description} — the order's total goes down with it.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body><FormAlert message={$removeLineMessage} class="mb-0" /></Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" disabled={$removingBusy}>
						{$removingBusy ? 'Removing…' : 'Remove'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>

<!-- Cancel the order: its lines freeze from here. -->
<Modal.Root bind:open={cancelOpen}>
	<Modal.Content>
		<form method="POST" action="?/cancel" use:actEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><Trash2Icon /> Cancel {data.purchase.number}?</Modal.Title>
					<Modal.Description>
						The order stays on the record, and its lines can no longer change — the table refuses
						them once it is cancelled.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body><FormAlert message={$actMessage} class="mb-0" /></Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Keep it</Modal.Cancel>
				<Modal.Action type="submit" color="primary-destructive" disabled={$acting}>
					{$acting ? 'Cancelling…' : 'Cancel order'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
