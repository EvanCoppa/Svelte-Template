<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import BanknoteIcon from '@lucide/svelte/icons/banknote';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Ledger from '$lib/components/ledger/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ComboboxGroup } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import {
		customerKey,
		isOverdue,
		localDate,
		summarizeLedger,
		withRunningBalance,
		type LedgerEntryWithBalance
	} from '$lib/crm/ledger';
	import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, PAYMENT_STATE_TONE } from '$lib/crm/tones';
	import { QUERY } from '$lib/queries';
	import { accountPaymentSchema, PAYMENT_KINDS } from '$lib/schemas/invoices';
	import { capitalize } from '$lib/utils.js';

	let { data } = $props();

	// Both are instants, so they read in the viewer's zone; the money is in
	// each row's own currency.
	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
	const money = (value: number, currency = 'USD') =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	// The viewer's own clock: "overdue" and "the last thirty days" are
	// wall-clock words, so the sums are done here rather than on the server —
	// read again whenever the rows do, the way the task board's "today" is.
	const now = $derived.by(() => {
		void data.entries;
		return new Date();
	});
	const today = $derived(localDate(now));
	const summary = $derived(summarizeLedger(data.entries, now));
	/** Filtered to one customer, the rows are a statement and carry a running balance. */
	const statement = $derived(data.customer !== '');
	const rows = $derived<LedgerEntryWithBalance[]>(
		statement
			? withRunningBalance(data.entries)
			: data.entries.map((entry) => ({ ...entry, balance: 0 }))
	);
	/**
	 * What is owed: on a statement the newest row's running balance (which
	 * goes below zero on an overpaid account), across the org what is
	 * outstanding net of the credit sitting unapplied.
	 */
	const balance = $derived(
		statement ? (rows[0]?.balance ?? 0) : summary.outstanding - summary.unapplied
	);
	/** The currency the figures at the top are in — the rows', or the default when there are none. */
	const currency = $derived(data.entries[0]?.currency ?? 'USD');

	/** Every customer the org bills, companies then people, for the filter and the payment form. */
	const customerGroups = $derived<ComboboxGroup[]>([
		{
			label: 'Companies',
			options: data.customers.companies.map((company) => ({
				value: customerKey({ kind: 'company', id: company.id }),
				label: company.name
			}))
		},
		{
			label: 'People',
			options: data.customers.contacts.map((contact) => ({
				value: customerKey({ kind: 'contact', id: contact.id }),
				label: contact.name,
				sublabel: contact.email ?? undefined
			}))
		}
	]);

	/** Filter to one account, or back to everyone — the query string is the state, so a link to a statement is shareable. */
	function filterTo(customer: string) {
		const url = new URL(page.url);
		if (customer === '') url.searchParams.delete('customer');
		else url.searchParams.set('customer', customer);
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	/**
	 * A `type="number"` input hands the binding a number, or null once cleared;
	 * every field here is a string (the schema's rule), so the setter puts the
	 * text back — the way the proposal builder's function bindings do.
	 */
	function asText(value: string | number | null | undefined): string {
		return value === null || value === undefined ? '' : String(value);
	}

	const KIND_OPTIONS = PAYMENT_KINDS.map((kind) => ({ value: kind, label: capitalize(kind) }));
	const METHOD_OPTIONS = PAYMENT_METHODS.map((method) => ({
		value: method,
		label: PAYMENT_METHOD_LABEL[method]
	}));

	/** An entry's state as one word, for the status column. */
	function statusOf(row: LedgerEntryWithBalance): string {
		if (row.kind === 'payment') return row.appliedTo ? 'applied' : 'on account';
		if (row.status === 'void') return 'void';
		return isOverdue(row, today) ? 'overdue' : row.paymentStatus;
	}

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, LedgerEntryWithBalance>();
	const columns = $derived.by(() => {
		const defs = columnHelper.columns([
			columnHelper.accessor('at', {
				header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Date' }),
				cell: ({ getValue }) => date.format(new Date(getValue()))
			}),
			columnHelper.accessor((row) => (row.kind === 'invoice' ? row.number : row.method), {
				id: 'entry',
				header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Entry' }),
				cell: ({ row }) => renderComponent(Ledger.EntryCell, { entry: row.original })
			}),
			columnHelper.accessor((row) => row.customer.name, {
				id: 'customer',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Customer' }),
				cell: ({ getValue, row }) => {
					const { href } = row.original.customer;
					return href ? DataTable.linkCell(getValue(), href) : getValue();
				}
			}),
			columnHelper.accessor(
				(row) => (row.kind === 'invoice' && row.status === 'issued' ? row.total : null),
				{
					id: 'charge',
					header: ({ column }) =>
						renderComponent(DataTable.ColumnHeader, { column, title: 'Charge' }),
					cell: ({ getValue, row }) => {
						const value = getValue();
						return value === null ? '—' : money(value, row.original.currency);
					}
				}
			),
			columnHelper.accessor(
				// A refund reads as a negative payment: money that went back.
				(row) => (row.kind === 'payment' ? -row.delta : null),
				{
					id: 'payment',
					header: ({ column }) =>
						renderComponent(DataTable.ColumnHeader, { column, title: 'Payment' }),
					cell: ({ getValue, row }) => {
						const value = getValue();
						return value === null ? '—' : money(value, row.original.currency);
					}
				}
			),
			// An explicit id: the filter below reads it, and an accessor key only
			// becomes one once the table is built.
			columnHelper.accessor((row) => row.balance, {
				id: 'balance',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Balance' }),
				cell: ({ getValue, row }) => money(getValue(), row.original.currency)
			}),
			columnHelper.accessor(statusOf, {
				id: 'status',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
				cell: ({ getValue }) => {
					const value = getValue();
					switch (value) {
						case 'applied':
							return DataTable.statusCell(value, 'success');
						case 'on account':
							return DataTable.statusCell(value, 'violet');
						case 'void':
							return DataTable.statusCell(value, 'warning');
						case 'overdue':
							return DataTable.statusCell(value, 'error');
						case 'paid':
						case 'partial':
						case 'unpaid':
							return DataTable.statusCell(value, PAYMENT_STATE_TONE[value]);
						default:
							return value;
					}
				}
			}),
			DataTable.actionsColumn(columnHelper, ({ row }) =>
				renderComponent(Ledger.RowActions, {
					name: row.original.kind === 'invoice' ? row.original.number : row.original.method,
					canDelete: data.canRemove && row.original.kind === 'payment',
					onDelete: () => (removingId = row.original.id)
				})
			)
		]);
		return defs.filter(
			(def) => (def.id !== 'balance' || statement) && (def.id !== 'actions' || data.canRemove)
		);
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

	let recordOpen = $state(false);
	let removingId = $state<string | null>(null);
	const removing = $derived(rows.find((row) => row.id === removingId) ?? null);

	const {
		form: paymentData,
		errors: paymentErrors,
		message: paymentMessage,
		constraints: paymentConstraints,
		submitting: recording,
		enhance: paymentEnhance
	} = superForm(data.paymentForm, {
		id: 'account-payment',
		validators: zod4Client(accountPaymentSchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			recordOpen = false;
			toast.success('Payment recorded');
			invalidate(QUERY.ledger);
		}
	});

	/**
	 * Open the form on the account being looked at, dated today — seeded from
	 * the form the load built after the last save, so the idempotency key is a
	 * fresh one rather than the one a saved payment already spent.
	 */
	function startRecording() {
		$paymentData = { ...data.paymentForm.data, customer: data.customer, received_at: today };
		recordOpen = true;
	}

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(data.removePaymentForm, {
		id: 'remove-payment',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingId = null;
			toast.success('Payment removed');
			invalidate(QUERY.ledger);
		}
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canRecord}
			<PageHeader.Actions>
				<Button onclick={startRecording}>
					<BanknoteIcon />
					Record payment
				</Button>
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<Ledger.Stat label={statement ? 'Balance' : 'Outstanding'} value={money(balance, currency)} />
		<Ledger.Stat
			label="Overdue"
			value={money(summary.overdue, currency)}
			class={summary.overdue > 0 ? 'text-destructive' : undefined}
		/>
		<Ledger.Stat label="Credit on account" value={money(summary.unapplied, currency)} />
		<Ledger.Stat label="Collected, last 30 days" value={money(summary.collected, currency)} />
	</div>

	<DataTable.Root {table}>
		<div class="flex flex-wrap items-center gap-2">
			<Combobox
				ariaLabel="Customer"
				size="sm"
				class="w-64"
				groups={customerGroups}
				value={data.customer}
				placeholder="Every customer"
				searchPlaceholder="Search customers…"
				clearable
				onchange={filterTo}
			/>
		</div>
		<DataTable.Content
			emptyMessage={statement ? 'Nothing on this account yet.' : 'Nothing on the books yet.'}
		/>
		<DataTable.Pagination noun="entry" nounPlural="entries" />
	</DataTable.Root>
</div>

<!-- Money on account: recorded against the customer, applied to an invoice later. -->
<Modal.Root bind:open={recordOpen}>
	<Modal.Content>
		<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
		<form method="POST" action="?/recordPayment" use:paymentEnhance>
			<input type="hidden" name="idempotency_key" value={$paymentData.idempotency_key} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><BanknoteIcon /> Record payment</Modal.Title>
					<Modal.Description>
						Money received on account. To settle a particular invoice, record it from that invoice's
						page instead.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$paymentMessage} class="mb-0" />
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="grid gap-2 sm:col-span-2">
							<Label for="account-payment-customer">From</Label>
							<Combobox
								id="account-payment-customer"
								name="customer"
								groups={customerGroups}
								bind:value={$paymentData.customer}
								placeholder="Pick a customer…"
								searchPlaceholder="Search customers…"
								invalid={Boolean($paymentErrors.customer)}
							/>
							{#if $paymentErrors.customer}
								<p id="account-payment-customer-error" class="text-destructive text-sm">
									{$paymentErrors.customer}
								</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="account-payment-kind">Direction</Label>
							<Combobox
								id="account-payment-kind"
								name="kind"
								options={KIND_OPTIONS}
								bind:value={$paymentData.kind}
								searchable={false}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="account-payment-method">Method</Label>
							<Combobox
								id="account-payment-method"
								name="method"
								options={METHOD_OPTIONS}
								bind:value={$paymentData.method}
								searchable={false}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="account-payment-amount">Amount</Label>
							<Input
								id="account-payment-amount"
								name="amount"
								type="number"
								step="0.01"
								min="0"
								placeholder="250.00"
								aria-invalid={$paymentErrors.amount ? 'true' : undefined}
								bind:value={
									() => $paymentData.amount, (value) => ($paymentData.amount = asText(value))
								}
								{...$paymentConstraints.amount}
							/>
							{#if $paymentErrors.amount}
								<p class="text-destructive text-sm">{$paymentErrors.amount}</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="account-payment-received">Received</Label>
							<Input
								id="account-payment-received"
								name="received_at"
								type="date"
								aria-invalid={$paymentErrors.received_at ? 'true' : undefined}
								aria-describedby={$paymentErrors.received_at
									? 'account-payment-received-error'
									: undefined}
								bind:value={$paymentData.received_at}
							/>
							{#if $paymentErrors.received_at}
								<p id="account-payment-received-error" class="text-destructive text-sm">
									{$paymentErrors.received_at}
								</p>
							{/if}
						</div>
						<div class="grid gap-2 sm:col-span-2">
							<Label for="account-payment-reference">Reference</Label>
							<Input
								id="account-payment-reference"
								name="reference"
								placeholder="Check number, transfer id…"
								bind:value={$paymentData.reference}
								{...$paymentConstraints.reference}
							/>
						</div>
						<div class="grid gap-2 sm:col-span-2">
							<Label for="account-payment-notes">Notes</Label>
							<Textarea
								id="account-payment-notes"
								name="notes"
								bind:value={$paymentData.notes}
								{...$paymentConstraints.notes}
							/>
						</div>
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$recording}>
					{$recording ? 'Recording…' : 'Record payment'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Taking a payment off the books — the one destructive act the page offers. -->
<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Modal.Content>
		{#if removing && removing.kind === 'payment'}
			<form method="POST" action="?/removePayment" use:removeEnhance>
				<input type="hidden" name="id" value={removing.paymentId} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Remove this payment?</Modal.Title>
						<Modal.Description>
							{money(removing.amount, removing.currency)} from {removing.customer.name} comes off the
							books{removing.appliedTo ? `, and ${removing.appliedTo.number} is owed again` : ''}.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" disabled={$deleting}>
						{$deleting ? 'Removing…' : 'Remove payment'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
