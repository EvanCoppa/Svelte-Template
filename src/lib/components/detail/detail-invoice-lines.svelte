<script lang="ts">
	import BanIcon from '@lucide/svelte/icons/ban';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SendIcon from '@lucide/svelte/icons/send';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { localDate } from '$lib/crm/ledger';
	import type { Enums } from '$lib/database.types';
	import type { InvoiceLineItem } from '$lib/server/crm/invoices';
	import {
		invoiceDetailsSchema,
		invoiceLifecycleSchema,
		invoiceLineSchema,
		issueInvoiceSchema,
		removeInvoiceLineSchema
	} from '$lib/schemas/invoices';
	import { capitalize } from '$lib/utils.js';

	/**
	 * What an invoice bills for, and the acts that move it through its life.
	 * The page owns the rows, the totals and the forms its load built; this
	 * part draws the lines table, the totals under it, and the modals behind
	 * "Add line", "Edit details", "Issue", "Void" and "Delete" — each posting
	 * to the record page's own action. Lines and header change only on a
	 * draft: issuing closes them (the invoicing migration's decision 3), so the
	 * buttons follow the status and the trigger is the backstop.
	 */
	let {
		invoiceId,
		status,
		currency,
		totals,
		lines,
		products,
		lineForm,
		removeLineForm,
		detailsForm,
		issueForm,
		voidForm,
		removeForm,
		canManage,
		canDelete,
		noun,
		queryKey
	}: {
		invoiceId: string;
		status: Enums<'invoice_status'>;
		currency: string;
		totals: {
			subtotal: number;
			tax: number;
			shipping: number;
			discount: number;
			total: number;
			amountPaid: number;
			balanceDue: number;
		};
		lines: InvoiceLineItem[];
		/** The catalog a line can start from; empty when there is none to offer. */
		products: {
			id: string;
			name: string;
			sku: string | null;
			unit_price: number;
			unit: string | null;
		}[];
		lineForm: SuperValidated<Infer<typeof invoiceLineSchema>>;
		removeLineForm: SuperValidated<Infer<typeof removeInvoiceLineSchema>>;
		detailsForm: SuperValidated<Infer<typeof invoiceDetailsSchema>>;
		issueForm: SuperValidated<Infer<typeof issueInvoiceSchema>>;
		voidForm: SuperValidated<Infer<typeof invoiceLifecycleSchema>>;
		removeForm: SuperValidated<Infer<typeof invoiceLifecycleSchema>>;
		canManage: boolean;
		canDelete: boolean;
		/** What the record is called — "this invoice". */
		noun: string;
		/** The record's own query key, refreshed after every save. */
		queryKey: string;
	} = $props();

	const money = (value: number) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

	const draft = $derived(status === 'draft');

	/**
	 * A `type="number"` input hands the binding a number, or null once cleared;
	 * every field here is a string (the schema's rule), so the setter puts the
	 * text back — the way the proposal builder's function bindings do.
	 */
	function asText(value: string | number | null | undefined): string {
		return value === null || value === undefined ? '' : String(value);
	}

	/** The catalog, as the picker offers it: the SKU under the name, the price on the right. */
	const productOptions = $derived<ComboboxOption[]>(
		products.map((product) => ({
			value: product.id,
			label: product.name,
			sublabel: product.sku ?? undefined,
			hint: product.unit
				? `${money(product.unit_price)} / ${product.unit}`
				: money(product.unit_price)
		}))
	);

	let lineOpen = $state(false);
	let removingLineId = $state<string | null>(null);
	const removingLine = $derived(lines.find((line) => line.id === removingLineId) ?? null);
	let detailsOpen = $state(false);
	let issueOpen = $state(false);
	let voidOpen = $state(false);
	let removeOpen = $state(false);

	const {
		form: lineData,
		errors: lineErrors,
		message: lineMessage,
		constraints: lineConstraints,
		submitting: savingLine,
		enhance: lineEnhance,
		reset: resetLine
	} = superForm(lineForm, {
		id: 'invoice-line',
		validators: zod4Client(invoiceLineSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			lineOpen = false;
			toast.success('Line saved');
			invalidate(queryKey);
		}
	});

	function startAddingLine() {
		resetLine();
		$lineData = { ...$lineData, quantity: '1' };
		lineOpen = true;
	}

	function startEditingLine(line: InvoiceLineItem) {
		$lineData = {
			id: line.id,
			product_id: line.product_id ?? '',
			description: line.description,
			quantity: String(line.quantity),
			unit_price: String(line.unit_price),
			discount: line.discount === 0 ? '' : String(line.discount),
			tax: line.tax === 0 ? '' : String(line.tax)
		};
		lineOpen = true;
	}

	/** Picking from the catalog fills the line in; every field stays editable — the line keeps its own words and price. */
	function pickProduct(productId: string) {
		const product = products.find((candidate) => candidate.id === productId);
		// Cleared: the line keeps its words and price, and stops citing the catalog.
		if (!product) {
			$lineData = { ...$lineData, product_id: '' };
			return;
		}
		$lineData = {
			...$lineData,
			product_id: product.id,
			description: product.name,
			unit_price: String(product.unit_price)
		};
	}

	const {
		message: removeLineMessage,
		submitting: removingLineNow,
		enhance: removeLineEnhance
	} = superForm(removeLineForm, {
		id: 'remove-invoice-line',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingLineId = null;
			toast.success('Line removed');
			invalidate(queryKey);
		}
	});

	const {
		form: detailsData,
		errors: detailsErrors,
		message: detailsMessage,
		constraints: detailsConstraints,
		submitting: savingDetails,
		enhance: detailsEnhance
	} = superForm(detailsForm, {
		id: 'invoice-details',
		validators: zod4Client(invoiceDetailsSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			detailsOpen = false;
			toast.success(`${capitalize(noun)} saved`);
			invalidate(queryKey);
		}
	});

	const {
		message: issueMessage,
		submitting: issuing,
		enhance: issueEnhance
	} = superForm(issueForm, {
		id: 'issue-invoice',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			issueOpen = false;
			toast.success(`${capitalize(noun)} issued`);
			invalidate(queryKey);
		}
	});

	const {
		message: voidMessage,
		submitting: voiding,
		enhance: voidEnhance
	} = superForm(voidForm, {
		id: 'void-invoice',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			voidOpen = false;
			toast.success(`${capitalize(noun)} voided`);
			invalidate(queryKey);
		}
	});

	// The action redirects to the list once the row is gone, so there is
	// nothing to invalidate here — the toast rides the redirect (the Toaster
	// is the root layout's), and a refusal comes back as the form's message.
	const {
		message: removeMessage,
		submitting: removing,
		enhance: removeEnhance
	} = superForm(removeForm, {
		id: 'remove-invoice',
		invalidateAll: false,
		onResult({ result }) {
			if (result.type === 'redirect') toast.success(`${capitalize(noun)} deleted`);
		}
	});

	/** The day the bill goes out, where the sender sits — posted with the issue form, read when it opens. */
	const issuedToday = $derived.by(() => {
		void issueOpen;
		return localDate(new Date());
	});

	/** The header fields, in the order the form asks for them. */
	const DETAIL_FIELDS = [
		{ name: 'payment_terms_days', label: 'Terms (days)', type: 'integer', placeholder: '30' },
		{ name: 'due_date', label: 'Due', type: 'date' },
		{ name: 'billing_email', label: 'Billing email', type: 'email', placeholder: 'ap@acme.com' },
		{ name: 'shipping', label: 'Shipping', type: 'number', placeholder: '0.00' },
		// The one off the whole bill; each line carries its own.
		{ name: 'discount', label: 'Discount', type: 'number', placeholder: '0.00' }
	] as const;
</script>

<Card.Root data-slot="detail-invoice-lines">
	<Card.Header>
		<Card.Title>Lines</Card.Title>
		<Card.Description>
			{#if draft}
				What this {noun} bills for. The totals follow the lines; issue it once they are right.
			{:else if status === 'issued'}
				Issued, so the lines are closed. To change them, void this {noun} and issue a new one.
			{:else}
				Voided. The lines stay as they were sent.
			{/if}
		</Card.Description>
		{#if canManage || canDelete}
			<Card.Action class="flex flex-wrap gap-2">
				{#if draft && canManage}
					<Button variant="outline" size="sm" onclick={() => (detailsOpen = true)}>
						<PencilIcon />
						Edit details
					</Button>
					<Button variant="outline" size="sm" onclick={startAddingLine}>
						<PlusIcon />
						Add line
					</Button>
					<Button size="sm" onclick={() => (issueOpen = true)} disabled={lines.length === 0}>
						<SendIcon />
						Issue
					</Button>
				{/if}
				{#if status === 'issued' && canManage}
					<Button variant="outline" size="sm" onclick={() => (voidOpen = true)}>
						<BanIcon />
						Void
					</Button>
				{/if}
				{#if draft && canDelete}
					<Button variant="ghost" size="sm" onclick={() => (removeOpen = true)}>
						<Trash2Icon />
						Delete
					</Button>
				{/if}
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if lines.length > 0}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Description</Table.Head>
						<Table.Head class="text-right">Qty</Table.Head>
						<Table.Head class="text-right">Unit price</Table.Head>
						<Table.Head class="text-right">Discount</Table.Head>
						<Table.Head class="text-right">Tax</Table.Head>
						<Table.Head class="text-right">Total</Table.Head>
						{#if draft && canManage}
							<Table.Head class="w-8"><span class="sr-only">Actions</span></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each lines as line (line.id)}
						<Table.Row>
							<Table.Cell class="whitespace-normal">
								<span class="font-medium">{line.description}</span>
								{#if line.product_sku_snapshot}
									<span class="text-muted-foreground ms-2 text-xs">{line.product_sku_snapshot}</span
									>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums"
								>{quantity.format(line.quantity)}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums">{money(line.unit_price)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{line.discount === 0 ? '—' : money(line.discount)}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{line.tax === 0 ? '—' : money(line.tax)}
							</Table.Cell>
							<Table.Cell class="text-right font-medium tabular-nums">
								{money(line.line_total ?? 0)}
							</Table.Cell>
							{#if draft && canManage}
								<Table.Cell class="pe-2">
									<span class="flex items-center justify-end gap-0.5">
										<Button
											variant="ghost"
											size="icon"
											class="size-7"
											title="Edit line"
											onclick={() => startEditingLine(line)}
										>
											<PencilIcon class="size-3.5" />
											<span class="sr-only">Edit line</span>
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="size-7"
											title="Remove line"
											onclick={() => (removingLineId = line.id)}
										>
											<Trash2Icon class="size-3.5" />
											<span class="sr-only">Remove line</span>
										</Button>
									</span>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title class="text-base">No lines yet</Empty.Title>
					<Empty.Description>
						{#if draft}
							Add what this {noun} bills for — from the catalog, or typed in.
						{:else}
							This {noun} bills for nothing.
						{/if}
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}

		<dl class="ms-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-8 gap-y-1.5 text-sm">
			<dt class="text-muted-foreground">Subtotal</dt>
			<dd class="text-right tabular-nums">{money(totals.subtotal)}</dd>
			<dt class="text-muted-foreground">Tax</dt>
			<dd class="text-right tabular-nums">{money(totals.tax)}</dd>
			{#if totals.shipping !== 0}
				<dt class="text-muted-foreground">Shipping</dt>
				<dd class="text-right tabular-nums">{money(totals.shipping)}</dd>
			{/if}
			{#if totals.discount !== 0}
				<dt class="text-muted-foreground">Discount</dt>
				<dd class="text-right tabular-nums">−{money(totals.discount)}</dd>
			{/if}
			<dt class="border-border border-t pt-1.5 font-medium">Total</dt>
			<dd class="border-border border-t pt-1.5 text-right font-medium tabular-nums">
				{money(totals.total)}
			</dd>
			{#if status === 'issued'}
				<dt class="text-muted-foreground">Paid</dt>
				<dd class="text-right tabular-nums">{money(totals.amountPaid)}</dd>
				<dt class="font-medium">Balance due</dt>
				<dd class="text-right font-medium tabular-nums">{money(totals.balanceDue)}</dd>
			{/if}
		</dl>
	</Card.Content>
</Card.Root>

<!-- One line, added or edited. -->
<Modal.Root bind:open={lineOpen}>
	<Modal.Content>
		<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
		<form method="POST" action="?/saveLine" use:lineEnhance>
			<input type="hidden" name="id" value={$lineData.id} />
			<input type="hidden" name="product_id" value={$lineData.product_id} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title>
						<PlusIcon />
						{$lineData.id === '' ? 'New line' : 'Edit line'}
					</Modal.Title>
					<Modal.Description>
						Pick from the catalog to fill the line in, or type it. The line keeps its own price once
						saved.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$lineMessage} class="mb-0" />
					<div class="grid gap-4 sm:grid-cols-2">
						{#if products.length > 0}
							<div class="grid gap-2 sm:col-span-2">
								<Label for="invoice-line-product">From the catalog</Label>
								<Combobox
									id="invoice-line-product"
									options={productOptions}
									value={$lineData.product_id}
									placeholder="Pick a product…"
									searchPlaceholder="Search by name or SKU…"
									clearable
									onchange={pickProduct}
								/>
							</div>
						{/if}
						<div class="grid gap-2 sm:col-span-2">
							<Label for="invoice-line-description">Description</Label>
							<Input
								id="invoice-line-description"
								name="description"
								placeholder="Site inspection"
								aria-invalid={$lineErrors.description ? 'true' : undefined}
								aria-describedby={$lineErrors.description
									? 'invoice-line-description-error'
									: undefined}
								bind:value={$lineData.description}
								{...$lineConstraints.description}
							/>
							{#if $lineErrors.description}
								<p id="invoice-line-description-error" class="text-destructive text-sm">
									{$lineErrors.description}
								</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="invoice-line-quantity">Quantity</Label>
							<Input
								id="invoice-line-quantity"
								name="quantity"
								type="number"
								step="0.0001"
								min="0"
								aria-invalid={$lineErrors.quantity ? 'true' : undefined}
								aria-describedby={$lineErrors.quantity ? 'invoice-line-quantity-error' : undefined}
								bind:value={
									() => $lineData.quantity, (value) => ($lineData.quantity = asText(value))
								}
								{...$lineConstraints.quantity}
							/>
							{#if $lineErrors.quantity}
								<p id="invoice-line-quantity-error" class="text-destructive text-sm">
									{$lineErrors.quantity}
								</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="invoice-line-unit-price">Unit price</Label>
							<Input
								id="invoice-line-unit-price"
								name="unit_price"
								type="number"
								step="0.0001"
								min="0"
								aria-invalid={$lineErrors.unit_price ? 'true' : undefined}
								aria-describedby={$lineErrors.unit_price
									? 'invoice-line-unit-price-error'
									: undefined}
								bind:value={
									() => $lineData.unit_price, (value) => ($lineData.unit_price = asText(value))
								}
								{...$lineConstraints.unit_price}
							/>
							{#if $lineErrors.unit_price}
								<p id="invoice-line-unit-price-error" class="text-destructive text-sm">
									{$lineErrors.unit_price}
								</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="invoice-line-discount">Discount</Label>
							<Input
								id="invoice-line-discount"
								name="discount"
								type="number"
								step="0.01"
								min="0"
								placeholder="0.00"
								aria-invalid={$lineErrors.discount ? 'true' : undefined}
								aria-describedby={$lineErrors.discount ? 'invoice-line-discount-error' : undefined}
								bind:value={
									() => $lineData.discount, (value) => ($lineData.discount = asText(value))
								}
							/>
							{#if $lineErrors.discount}
								<p id="invoice-line-discount-error" class="text-destructive text-sm">
									{$lineErrors.discount}
								</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="invoice-line-tax">Tax</Label>
							<Input
								id="invoice-line-tax"
								name="tax"
								type="number"
								step="0.01"
								min="0"
								placeholder="0.00"
								aria-invalid={$lineErrors.tax ? 'true' : undefined}
								aria-describedby={$lineErrors.tax ? 'invoice-line-tax-error' : undefined}
								bind:value={() => $lineData.tax, (value) => ($lineData.tax = asText(value))}
							/>
							{#if $lineErrors.tax}
								<p id="invoice-line-tax-error" class="text-destructive text-sm">
									{$lineErrors.tax}
								</p>
							{/if}
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
							{removingLine.description} comes off the {noun}; the totals follow.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeLineMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$removingLineNow}>
						{$removingLineNow ? 'Removing…' : 'Remove line'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>

<!-- The header: terms, dates, the two money figures typed by hand, and the words. -->
<Modal.Root bind:open={detailsOpen}>
	<Modal.Content>
		<form method="POST" action="?/saveDetails" use:detailsEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><PencilIcon /> {capitalize(noun)} details</Modal.Title>
					<Modal.Description>
						Terms fill the due date in when the {noun} is issued; a date set here stands.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$detailsMessage} class="mb-0" />
					<div class="grid gap-4 sm:grid-cols-2">
						{#each DETAIL_FIELDS as field (field.name)}
							<div class="grid gap-2">
								<Label for={`invoice-details-${field.name}`}>{field.label}</Label>
								<Input
									id={`invoice-details-${field.name}`}
									name={field.name}
									type={field.type === 'integer' ? 'number' : field.type}
									step={field.type === 'number'
										? '0.01'
										: field.type === 'integer'
											? '1'
											: undefined}
									min={field.type === 'number' || field.type === 'integer' ? '0' : undefined}
									placeholder={'placeholder' in field ? field.placeholder : undefined}
									aria-invalid={$detailsErrors[field.name] ? 'true' : undefined}
									aria-describedby={$detailsErrors[field.name]
										? `invoice-details-${field.name}-error`
										: undefined}
									bind:value={
										() => $detailsData[field.name],
										(value) => ($detailsData[field.name] = asText(value))
									}
									{...$detailsConstraints[field.name]}
								/>
								{#if $detailsErrors[field.name]}
									<p id={`invoice-details-${field.name}-error`} class="text-destructive text-sm">
										{$detailsErrors[field.name]}
									</p>
								{/if}
							</div>
						{/each}
						<div class="grid gap-2 sm:col-span-2">
							<Label for="invoice-details-memo">Memo</Label>
							<Textarea
								id="invoice-details-memo"
								name="memo"
								placeholder="Shown on the invoice"
								bind:value={$detailsData.memo}
								{...$detailsConstraints.memo}
							/>
						</div>
						<div class="grid gap-2 sm:col-span-2">
							<Label for="invoice-details-notes">Internal notes</Label>
							<Textarea
								id="invoice-details-notes"
								name="notes"
								placeholder="Not shown to the customer"
								bind:value={$detailsData.notes}
								{...$detailsConstraints.notes}
							/>
						</div>
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$savingDetails}>
					{$savingDetails ? 'Saving…' : 'Save details'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Issuing: the draft becomes a claim, and its lines close. -->
<Modal.Root bind:open={issueOpen}>
	<Modal.Content>
		<form method="POST" action="?/issue" use:issueEnhance>
			<input type="hidden" name="id" value={invoiceId} />
			<input type="hidden" name="today" value={issuedToday} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><SendIcon /> Issue this {noun}?</Modal.Title>
					<Modal.Description>
						{money(totals.total)} becomes owed and goes on the ledger. The lines close; to change them
						afterwards, void it and issue a new one.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$issueMessage} class="mb-0" />
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$issuing}>
					{$issuing ? 'Issuing…' : `Issue ${noun}`}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Voiding: withdrawn, kept in the record; its payments fall back to the account. -->
<Modal.Root bind:open={voidOpen}>
	<Modal.Content>
		<form method="POST" action="?/void" use:voidEnhance>
			<input type="hidden" name="id" value={invoiceId} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><BanIcon /> Void this {noun}?</Modal.Title>
					<Modal.Description>
						Nothing is owed on it any more. It stays in the record, and any payment applied to it
						goes back on the customer's account to be applied elsewhere.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$voidMessage} class="mb-0" />
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" color="primary-destructive" disabled={$voiding}>
					{$voiding ? 'Voiding…' : `Void ${noun}`}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Deleting: only a draft, which nobody has seen. -->
<Modal.Root bind:open={removeOpen}>
	<Modal.Content>
		<form method="POST" action="?/remove" use:removeEnhance>
			<input type="hidden" name="id" value={invoiceId} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><Trash2Icon /> Delete this draft?</Modal.Title>
					<Modal.Description>
						The draft and its lines go. An issued {noun} is never deleted — it is voided, so the record
						keeps it.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$removeMessage} class="mb-0" />
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" color="primary-destructive" disabled={$removing}>
					{$removing ? 'Deleting…' : 'Delete draft'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
