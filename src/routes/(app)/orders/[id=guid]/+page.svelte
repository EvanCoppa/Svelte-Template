<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ShoppingCartIcon from '@lucide/svelte/icons/shopping-cart';
	import SplitIcon from '@lucide/svelte/icons/split';
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
	import { isCarrierOwned, LINE_FULFILLMENT_STATUSES } from '$lib/crm/orders';
	import { recordTerms } from '$lib/crm/records';
	import { FULFILLMENT_STATE_TONE, LINE_FULFILLMENT_TONE, ORDER_STATUS_TONE } from '$lib/crm/tones';
	import { QUERY } from '$lib/queries';
	import { capitalize } from '$lib/utils.js';
	import {
		orderLineSchema,
		splitOrderLineSchema,
		setLineStatusSchema,
		updateOrderLineSchema
	} from './schema';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'order'));
	const productTerms = $derived(recordTerms(page.data.terms, 'product'));
	const companyTerms = $derived(recordTerms(page.data.terms, 'company'));

	const money = (value: number | null, currency: string) =>
		value === null
			? '—'
			: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	const when = (value: string | null) =>
		value === null
			? '—'
			: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));

	const lines = $derived(data.order.order_line_items);
	const currency = $derived(data.order.currency);

	/** Every live product a line can cite. The citation is provenance: the line keeps its own price. */
	const productOptions = $derived<ComboboxOption[]>([
		{ value: '', label: `No ${productTerms.noun} — a one-off line` },
		...data.products.map((product) => ({
			value: product.id,
			label: product.name,
			sublabel: product.sku ?? undefined
		}))
	]);

	/** Who is filling the line. Blank is the org's own stock, or not decided yet. */
	const supplierOptions = $derived<ComboboxOption[]>([
		{ value: '', label: 'Our own stock' },
		...data.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))
	]);

	const statusOptions: ComboboxOption[] = LINE_FULFILLMENT_STATUSES.map((status) => ({
		value: status,
		label: capitalize(status)
	}));

	let addOpen = $state(false);
	let editingLineId = $state<string | null>(null);
	let removingLineId = $state<string | null>(null);
	let splittingLineId = $state<string | null>(null);
	let cancelOpen = $state(false);
	const removingLine = $derived(lines.find((line) => line.id === removingLineId) ?? null);
	const splittingLine = $derived(lines.find((line) => line.id === splittingLineId) ?? null);

	const refresh = () => {
		invalidate(QUERY.record('order', data.order.id));
		invalidate(QUERY.orders);
	};

	const {
		form: addData,
		errors: addErrors,
		message: addMessage,
		submitting: adding,
		enhance: addEnhance
	} = superForm(data.addLineForm, {
		id: 'add-order-line',
		validators: zod4Client(orderLineSchema),
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
		id: 'update-order-line',
		validators: zod4Client(updateOrderLineSchema),
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
			supplier_id: line.supplier_id ?? '',
			description: line.description,
			product_sku_snapshot: line.product_sku_snapshot ?? '',
			quantity: String(line.quantity),
			unit_price: String(line.unit_price),
			discount: String(line.discount),
			tax: String(line.tax)
		};
		editingLineId = line.id;
	}

	const {
		form: statusData,
		message: statusMessage,
		enhance: statusEnhance
	} = superForm(data.statusForm, {
		id: 'set-order-line-status',
		validators: zod4Client(setLineStatusSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			// The header's fulfillment moved with it, by trigger — so the whole
			// record is re-read rather than just the line.
			toast.success('Line moved');
			refresh();
		}
	});

	/**
	 * The status picker posts through a hidden form the way the task board's
	 * chips do: the gesture belongs to the page it lives on, so it is a form
	 * action and never a `fetch` of our own.
	 */
	let statusForm = $state<HTMLFormElement | null>(null);
	function moveLine(id: string, status: string) {
		// The picker hands back a bare string, so the status is FOUND in the
		// list rather than asserted to be in it — a stale value then posts
		// nothing instead of a row the enum would refuse.
		const chosen = LINE_FULFILLMENT_STATUSES.find((value) => value === status);
		if (!chosen) return;
		$statusData = { id, fulfillment_status: chosen };
		statusForm?.requestSubmit();
	}

	const {
		form: splitData,
		errors: splitErrors,
		message: splitMessage,
		submitting: splitting,
		enhance: splitEnhance
	} = superForm(data.splitForm, {
		id: 'split-order-line',
		validators: zod4Client(splitOrderLineSchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			splittingLineId = null;
			toast.success('Line split');
			refresh();
		}
	});

	function startSplitting(line: (typeof lines)[number]) {
		$splitData = { id: line.id, quantity: String(line.quantity) };
		splittingLineId = line.id;
	}

	const {
		message: removeLineMessage,
		submitting: removingBusy,
		enhance: removeLineEnhance
	} = superForm(data.removeLineForm, {
		id: 'remove-order-line',
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
		id: 'confirm-order',
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
						<Button {...props} href="/orders" variant="ghost" size="icon" class="shrink-0">
							<ArrowLeftIcon />
							<span class="sr-only">All {terms.plural}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>All {terms.plural}</Tooltip.Content>
			</Tooltip.Root>
			<div class="min-w-0">
				<p class="text-muted-foreground text-xs">
					{#if data.order.companies}
						{#if data.canOpenParty}
							<a href="/companies/{data.order.companies.id}" class="hover:underline">
								{data.order.companies.name}
							</a>
						{:else}
							{data.order.companies.name}
						{/if}
					{/if}
					{#if data.order.contacts}
						<span aria-hidden="true"> · </span>
						{#if data.canOpenContact}
							<a href="/contacts/{data.order.contacts.id}" class="hover:underline">
								{data.order.contacts.name}
							</a>
						{:else}
							{data.order.contacts.name}
						{/if}
					{/if}
				</p>
				<div class="flex items-center gap-2">
					<PageHeader.Title>{data.order.number}</PageHeader.Title>
					<!-- Both axes: what a person committed to, and what the lines
					     have folded into. -->
					<StatusBadge tone={ORDER_STATUS_TONE[data.order.status]}>
						{data.order.status}
					</StatusBadge>
					<StatusBadge tone={FULFILLMENT_STATE_TONE[data.order.fulfillment_status]}>
						{data.order.fulfillment_status}
					</StatusBadge>
				</div>
			</div>
		</div>
		<PageHeader.Actions>
			{#if data.edit}
				<EditRecord
					type="order"
					recordId={data.order.id}
					form={data.edit.editForm}
					pickers={data.edit.editPickers}
				/>
			{/if}
			{#if data.canConfirm}
				<form method="POST" action="?/confirm" use:actEnhance>
					<Button type="submit" disabled={$acting}>
						{$acting ? 'Confirming…' : 'Confirm order'}
					</Button>
				</form>
			{/if}
			{#if data.canCancel}
				<Button variant="outline" onclick={() => (cancelOpen = true)}>Cancel order</Button>
			{/if}
		</PageHeader.Actions>
	</PageHeader.Root>

	<FormAlert message={$actMessage} />

	<!-- What it adds up to. Every figure is the database's: the subtotal and
	     the tax roll up from the lines and the total is generated from them. -->
	<Card.Root>
		<Card.Content class="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
			{#each [['Subtotal', data.order.subtotal], ['Tax', data.order.tax], ['Shipping', data.order.shipping], ['Discount', data.order.discount], ['Total', data.order.total]] as [label, value] (label)}
				<div>
					<p class="text-muted-foreground text-xs">{label}</p>
					<p class="text-lg tabular-nums">{money(value as number | null, currency)}</p>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each [['Confirmed', data.order.confirmed_at], ['Est. ship', data.order.estimated_ship_date], ['Customer PO', data.order.customer_po]] as [label, value] (label)}
			<Card.Root>
				<Card.Content>
					<p class="text-muted-foreground text-xs">{label}</p>
					<p class="text-sm">
						{label === 'Customer PO' ? (value ?? '—') : when(value as string | null)}
					</p>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<!-- The lines, and where each of them stands. -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Lines</Card.Title>
			<Card.Description>
				What was asked for, and where each line stands. Shipping part of a line is a SPLIT — a
				shipment carries whole lines, so four of ten cases is a four and a six.
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
					<Empty.Media variant="icon"><ShoppingCartIcon /></Empty.Media>
					<Empty.Title>Nothing on this order yet</Empty.Title>
					<Empty.Description>Add what the customer asked for, then confirm it.</Empty.Description>
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
									{line.quantity} × {money(line.unit_price, currency)} =
									{money(line.line_total, currency)}
								</span>
							</div>
							<div class="flex flex-wrap items-center gap-3">
								<StatusBadge tone={LINE_FULFILLMENT_TONE[line.fulfillment_status]}>
									{line.fulfillment_status}
								</StatusBadge>
								{#if line.supplier_id}
									{@const supplier = data.suppliers.find((row) => row.id === line.supplier_id)}
									{#if supplier}
										<span class="text-muted-foreground text-xs">via {supplier.name}</span>
									{/if}
								{/if}
								{#if data.linesEditable}
									{#if isCarrierOwned(line.fulfillment_status)}
										<!-- The carrier owns this line's state now: a scan on the
										     shipment carrying it wrote `shipped` or `delivered`, and
										     typing over that would claim a box moved. -->
										<span class="text-muted-foreground ms-auto text-xs">
											moved by the carrier
										</span>
									{:else}
										<div class="ms-auto w-40">
											<Label class="sr-only" for="status-{line.id}">Line status</Label>
											<Combobox
												id="status-{line.id}"
												options={statusOptions}
												value={line.fulfillment_status}
												onchange={(value) => moveLine(line.id, value)}
											/>
										</div>
									{/if}
									<Button size="sm" variant="ghost" onclick={() => startSplitting(line)}>
										<SplitIcon />
										<span class="sr-only">Split {line.description}</span>
									</Button>
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
			<FormAlert message={$statusMessage} class="mx-6 mb-4" />
		</Card.Content>
	</Card.Root>

	{#if data.order.notes}
		<Card.Root>
			<Card.Header><Card.Title>Notes</Card.Title></Card.Header>
			<Card.Content><p class="text-sm whitespace-pre-wrap">{data.order.notes}</p></Card.Content>
		</Card.Root>
	{/if}
</div>

<!-- The picker above posts through this: a gesture on the page it lives on is
     still a form action, filled from script and submitted. -->
<form
	method="POST"
	action="?/setLineStatus"
	use:statusEnhance
	bind:this={statusForm}
	class="hidden"
	aria-hidden="true"
>
	<input type="hidden" name="id" bind:value={$statusData.id} />
	<input type="hidden" name="fulfillment_status" bind:value={$statusData.fulfillment_status} />
</form>

<!-- Add a line. -->
<Modal.Root bind:open={addOpen}>
	<Modal.Content>
		<form method="POST" action="?/addLine" use:addEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><PlusIcon /> Add a line</Modal.Title>
					<Modal.Description>
						Citing a {productTerms.noun} records where the line came from; the line keeps its own description
						and price, so repricing the catalog never rewrites this order.
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
						<Label for="add-line-supplier">Filled by</Label>
						<Combobox
							id="add-line-supplier"
							name="supplier_id"
							options={supplierOptions}
							bind:value={$addData.supplier_id}
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
					<div class="grid gap-2 sm:grid-cols-4">
						<div class="grid gap-2">
							<Label for="add-line-qty">Quantity</Label>
							<Input
								id="add-line-qty"
								name="quantity"
								inputmode="decimal"
								aria-invalid={$addErrors.quantity ? 'true' : undefined}
								bind:value={$addData.quantity}
							/>
							{#if $addErrors.quantity}
								<p class="text-destructive text-sm">{$addErrors.quantity}</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="add-line-price">Unit price</Label>
							<Input
								id="add-line-price"
								name="unit_price"
								inputmode="decimal"
								bind:value={$addData.unit_price}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="add-line-discount">Discount</Label>
							<Input
								id="add-line-discount"
								name="discount"
								inputmode="decimal"
								bind:value={$addData.discount}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="add-line-tax">Tax</Label>
							<Input id="add-line-tax" name="tax" inputmode="decimal" bind:value={$addData.tax} />
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
					<Modal.Title><ShoppingCartIcon /> Edit line</Modal.Title>
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
						<Label for="edit-line-supplier">Filled by</Label>
						<Combobox
							id="edit-line-supplier"
							name="supplier_id"
							options={supplierOptions}
							bind:value={$editLineData.supplier_id}
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
					<div class="grid gap-2 sm:grid-cols-4">
						<div class="grid gap-2">
							<Label for="edit-line-qty">Quantity</Label>
							<Input
								id="edit-line-qty"
								name="quantity"
								inputmode="decimal"
								bind:value={$editLineData.quantity}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="edit-line-price">Unit price</Label>
							<Input
								id="edit-line-price"
								name="unit_price"
								inputmode="decimal"
								bind:value={$editLineData.unit_price}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="edit-line-discount">Discount</Label>
							<Input
								id="edit-line-discount"
								name="discount"
								inputmode="decimal"
								bind:value={$editLineData.discount}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="edit-line-tax">Tax</Label>
							<Input
								id="edit-line-tax"
								name="tax"
								inputmode="decimal"
								bind:value={$editLineData.tax}
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

<!-- Split a line, so part of it can ship on its own. -->
<Modal.Root
	open={splittingLine !== null}
	onOpenChange={(open) => {
		if (!open) splittingLineId = null;
	}}
>
	<Modal.Content>
		{#if splittingLine}
			<form method="POST" action="?/splitLine" use:splitEnhance>
				<input type="hidden" name="id" value={splittingLine.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><SplitIcon /> Split this line</Modal.Title>
						<Modal.Description>
							{splittingLine.description} — {splittingLine.quantity} in all. What this line keeps stays
							here; the rest leaves as a new pending line, which is how part of it ships on its own.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$splitMessage} class="mb-0" />
						<div class="grid gap-2">
							<Label for="split-qty">This line keeps</Label>
							<Input
								id="split-qty"
								name="quantity"
								inputmode="decimal"
								aria-invalid={$splitErrors.quantity ? 'true' : undefined}
								bind:value={$splitData.quantity}
							/>
							{#if $splitErrors.quantity}
								<p class="text-destructive text-sm">{$splitErrors.quantity}</p>
							{/if}
						</div>
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$splitting}>
						{$splitting ? 'Splitting…' : 'Split line'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
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
					<Modal.Title><Trash2Icon /> Cancel {data.order.number}?</Modal.Title>
					<Modal.Description>
						The order stays on the record, and its lines can no longer change — the table refuses
						them once it is cancelled. Any {companyTerms.noun} invoices raised against it are untouched.
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
