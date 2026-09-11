<script lang="ts">
	import BanknoteIcon from '@lucide/svelte/icons/banknote';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { localDate } from '$lib/crm/ledger';
	import { PAYMENT_KIND_TONE, PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from '$lib/crm/tones';
	import type { Enums } from '$lib/database.types';
	import type { Payment } from '$lib/server/crm/payments';
	import { PAYMENT_KINDS, paymentIdSchema, paymentSchema } from '$lib/schemas/invoices';
	import { capitalize } from '$lib/utils.js';

	/**
	 * The money against an invoice: what has been received on it, the
	 * customer's money on account that could settle it, and the forms that
	 * record, apply and remove a payment — each posting to the record page's
	 * own action. Money is the ledger feature's, so the buttons follow its
	 * grants rather than the invoice's.
	 */
	let {
		status,
		currency,
		balanceDue,
		payments,
		unapplied,
		paymentForm,
		applyForm,
		removePaymentForm,
		canRecord,
		canRemove,
		noun,
		queryKey
	}: {
		status: Enums<'invoice_status'>;
		currency: string;
		balanceDue: number;
		/** Applied to this invoice, newest first. */
		payments: Payment[];
		/** On the customer's account, applied to nothing — offered only where it could be applied. */
		unapplied: Payment[];
		paymentForm: SuperValidated<Infer<typeof paymentSchema>>;
		applyForm: SuperValidated<Infer<typeof paymentIdSchema>>;
		removePaymentForm: SuperValidated<Infer<typeof paymentIdSchema>>;
		canRecord: boolean;
		canRemove: boolean;
		/** What the record is called — "this invoice". */
		noun: string;
		/** The record's own query key, refreshed after every save. */
		queryKey: string;
	} = $props();

	const money = (value: number) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const issued = $derived(status === 'issued');

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

	let recordOpen = $state(false);
	let removingId = $state<string | null>(null);
	const removing = $derived(payments.find((payment) => payment.id === removingId) ?? null);

	const {
		form: paymentData,
		errors: paymentErrors,
		message: paymentMessage,
		constraints: paymentConstraints,
		submitting: recording,
		enhance: paymentEnhance
	} = superForm(paymentForm, {
		id: 'invoice-payment',
		validators: zod4Client(paymentSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			recordOpen = false;
			toast.success('Payment recorded');
			invalidate(queryKey);
		}
	});

	/**
	 * Open the form for what is still owed, dated today. The store keeps what
	 * was last typed, so it is seeded from the form the load built after the
	 * last save — the balance as it stands, and a fresh idempotency key.
	 */
	function startRecording() {
		$paymentData = { ...paymentForm.data, received_at: localDate(new Date()) };
		recordOpen = true;
	}

	// Applying is a click, not a form to fill in: a hidden form bound to the
	// store, filled from script and submitted the way the calendar's drag
	// posts its move (CLAUDE.md, "Server actions vs API endpoints").
	let applyElement = $state<HTMLFormElement | null>(null);
	const {
		form: applyData,
		message: applyMessage,
		submitting: applying,
		enhance: applyEnhance
	} = superForm(applyForm, {
		id: 'apply-payment',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success('Payment applied');
			invalidate(queryKey);
		}
	});

	async function apply(payment: Payment) {
		$applyData = { id: payment.id };
		// The hidden input takes the store's value on the next flush; submitting
		// before it would post the last payment's id, the way the calendar's
		// move waits too.
		await tick();
		applyElement?.requestSubmit();
	}

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(removePaymentForm, {
		id: 'remove-payment',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingId = null;
			toast.success('Payment removed');
			invalidate(queryKey);
		}
	});

	/** One payment as a line of text: how it came in, and its reference. */
	function describe(payment: Payment): string {
		const method = PAYMENT_METHOD_LABEL[payment.method];
		return payment.reference ? `${method} · ${payment.reference}` : method;
	}
</script>

<Card.Root data-slot="detail-invoice-payments">
	<Card.Header>
		<Card.Title>Payments</Card.Title>
		<Card.Description>
			{#if issued}
				What has been received against this {noun}. Money the customer has on account can be applied
				to it here.
			{:else if status === 'draft'}
				Payments are recorded once the {noun} is issued.
			{:else}
				Voided: any payment it had was moved back onto the customer's account.
			{/if}
		</Card.Description>
		{#if issued && canRecord}
			<Card.Action>
				<Button variant="outline" size="sm" onclick={startRecording}>
					<BanknoteIcon />
					Record payment
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if payments.length > 0}
			<ul class="divide-border divide-y">
				{#each payments as payment (payment.id)}
					<li class="flex items-center justify-between gap-3 py-2.5">
						<div class="min-w-0">
							<p class="text-sm font-medium">{describe(payment)}</p>
							<p class="text-muted-foreground truncate text-xs">
								{date.format(new Date(payment.received_at))}{payment.notes
									? ` · ${payment.notes}`
									: ''}
							</p>
						</div>
						<div class="flex items-center gap-2">
							<StatusBadge tone={PAYMENT_KIND_TONE[payment.kind]}>
								{capitalize(payment.kind)}
							</StatusBadge>
							<span class="text-sm font-medium tabular-nums">
								{payment.kind === 'refund' ? '−' : ''}{money(payment.amount)}
							</span>
							{#if canRemove}
								<Button
									variant="ghost"
									size="icon"
									class="size-7"
									title="Remove payment"
									onclick={() => (removingId = payment.id)}
								>
									<Trash2Icon class="size-3.5" />
									<span class="sr-only">Remove payment</span>
								</Button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title class="text-base">Nothing received yet</Empty.Title>
					<Empty.Description>
						{#if issued}
							{money(balanceDue)} is owed on this {noun}.
						{:else}
							Money against this {noun} will show up here.
						{/if}
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}

		{#if issued && canRecord && unapplied.length > 0}
			<div class="border-border space-y-2 rounded-lg border p-3">
				<p class="text-sm font-medium">On account</p>
				<p class="text-muted-foreground text-xs">
					Received from this customer and not applied to anything yet.
				</p>
				<FormAlert message={$applyMessage} class="mb-0" />
				<ul class="divide-border divide-y">
					{#each unapplied as payment (payment.id)}
						<li class="flex items-center justify-between gap-3 py-2">
							<div class="min-w-0">
								<p class="text-sm">{describe(payment)}</p>
								<p class="text-muted-foreground text-xs">
									{date.format(new Date(payment.received_at))}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium tabular-nums">{money(payment.amount)}</span>
								<Button
									variant="outline"
									size="sm"
									disabled={$applying}
									onclick={() => apply(payment)}
								>
									Apply
								</Button>
							</div>
						</li>
					{/each}
				</ul>
				<form
					method="POST"
					action="?/applyPayment"
					class="hidden"
					bind:this={applyElement}
					use:applyEnhance
				>
					<input type="hidden" name="id" value={$applyData.id} />
				</form>
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- Money against this invoice. -->
<Modal.Root bind:open={recordOpen}>
	<Modal.Content>
		<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
		<form method="POST" action="?/recordPayment" use:paymentEnhance>
			<input type="hidden" name="idempotency_key" value={$paymentData.idempotency_key} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><BanknoteIcon /> Record payment</Modal.Title>
					<Modal.Description>
						Applied to this {noun}. {money(balanceDue)} is still owed; more than that shows as credit.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$paymentMessage} class="mb-0" />
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="grid gap-2">
							<Label for="invoice-payment-kind">Direction</Label>
							<Combobox
								id="invoice-payment-kind"
								name="kind"
								options={KIND_OPTIONS}
								bind:value={$paymentData.kind}
								searchable={false}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="invoice-payment-method">Method</Label>
							<Combobox
								id="invoice-payment-method"
								name="method"
								options={METHOD_OPTIONS}
								bind:value={$paymentData.method}
								searchable={false}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="invoice-payment-amount">Amount</Label>
							<Input
								id="invoice-payment-amount"
								name="amount"
								type="number"
								step="0.01"
								min="0"
								aria-invalid={$paymentErrors.amount ? 'true' : undefined}
								aria-describedby={$paymentErrors.amount
									? 'invoice-payment-amount-error'
									: undefined}
								bind:value={
									() => $paymentData.amount, (value) => ($paymentData.amount = asText(value))
								}
								{...$paymentConstraints.amount}
							/>
							{#if $paymentErrors.amount}
								<p id="invoice-payment-amount-error" class="text-destructive text-sm">
									{$paymentErrors.amount}
								</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="invoice-payment-received">Received</Label>
							<Input
								id="invoice-payment-received"
								name="received_at"
								type="date"
								aria-invalid={$paymentErrors.received_at ? 'true' : undefined}
								aria-describedby={$paymentErrors.received_at
									? 'invoice-payment-received-error'
									: undefined}
								bind:value={$paymentData.received_at}
							/>
							{#if $paymentErrors.received_at}
								<p id="invoice-payment-received-error" class="text-destructive text-sm">
									{$paymentErrors.received_at}
								</p>
							{/if}
						</div>
						<div class="grid gap-2 sm:col-span-2">
							<Label for="invoice-payment-reference">Reference</Label>
							<Input
								id="invoice-payment-reference"
								name="reference"
								placeholder="Check number, transfer id…"
								bind:value={$paymentData.reference}
								{...$paymentConstraints.reference}
							/>
						</div>
						<div class="grid gap-2 sm:col-span-2">
							<Label for="invoice-payment-notes">Notes</Label>
							<Textarea
								id="invoice-payment-notes"
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

<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Modal.Content>
		{#if removing}
			<form method="POST" action="?/removePayment" use:removeEnhance>
				<input type="hidden" name="id" value={removing.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Remove this payment?</Modal.Title>
						<Modal.Description>
							{money(removing.amount)} comes off the books and this {noun} is owed it again.
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
