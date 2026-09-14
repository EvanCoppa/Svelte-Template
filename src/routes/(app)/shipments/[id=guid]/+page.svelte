<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PackageIcon from '@lucide/svelte/icons/package';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TruckIcon from '@lucide/svelte/icons/truck';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
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
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { DELIVERY_STATUSES, deliveryLabel, movesTheOrder } from '$lib/crm/shipments';
	import { LINE_FULFILLMENT_TONE, SHIPMENT_DELIVERY_TONE } from '$lib/crm/tones';
	import { QUERY } from '$lib/queries';
	import { logEventSchema, shipmentSchema } from './schema';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'shipment'));
	const orderTerms = $derived(recordTerms(page.data.terms, 'order'));

	const money = (value: number | null, currency = 'USD') =>
		value === null
			? '—'
			: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	const when = (value: string | null) =>
		value === null
			? '—'
			: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
	const stamp = (value: string) =>
		new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(value)
		);

	const packed = $derived(data.shipment.shipment_line_items);
	const scans = $derived(data.shipment.shipment_events);

	const statusOptions: ComboboxOption[] = DELIVERY_STATUSES.map((status) => ({
		value: status,
		label: deliveryLabel(status)
	}));

	const supplierOptions = $derived<ComboboxOption[]>([
		{ value: '', label: 'We shipped it ourselves' },
		...data.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))
	]);

	/** This order's lines that are not in a box yet — a line is in one box only. */
	const packableOptions = $derived<ComboboxOption[]>(
		data.packable.map((line) => ({
			value: line.id,
			label: line.description,
			sublabel: `${line.quantity} × ${money(line.unit_price)}`
		}))
	);

	let editOpen = $state(false);
	let packOpen = $state(false);
	let scanOpen = $state(false);
	let unpackingId = $state<string | null>(null);
	const unpacking = $derived(
		packed.find((row) => row.order_line_item_id === unpackingId)?.order_line_items ?? null
	);

	const refresh = () => {
		invalidate(QUERY.record('shipment', data.shipment.id));
		invalidate(QUERY.shipments);
		// The status write reaches the order's lines by trigger, so the order
		// is stale too whenever this page writes.
		invalidate(QUERY.orders);
	};

	const {
		form: editData,
		errors: editErrors,
		message: editMessage,
		submitting: saving,
		enhance: editEnhance
	} = superForm(data.editForm, {
		id: 'edit-shipment',
		validators: zod4Client(shipmentSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			editOpen = false;
			toast.success('Shipment saved');
			refresh();
		}
	});

	const {
		form: statusData,
		message: statusMessage,
		enhance: statusEnhance
	} = superForm(data.statusForm, {
		id: 'set-delivery-status',
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success('Status updated');
			refresh();
		}
	});

	/**
	 * The picker posts through a hidden form the way the order page's line
	 * status does: a gesture on the page it lives on is a form action, never a
	 * `fetch` of our own.
	 */
	let statusFormEl = $state<HTMLFormElement | null>(null);
	function moveBox(status: string) {
		// The picker hands back a bare string, so the status is FOUND in the
		// list rather than asserted to be in it.
		const chosen = DELIVERY_STATUSES.find((value) => value === status);
		if (!chosen) return;
		$statusData.delivery_status = chosen;
		statusFormEl?.requestSubmit();
	}

	const {
		form: packData,
		message: packMessage,
		submitting: packing,
		enhance: packEnhance
	} = superForm(data.packForm, {
		id: 'pack-line',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			packOpen = false;
			toast.success('Packed');
			refresh();
		}
	});

	const {
		message: unpackMessage,
		submitting: unpackingBusy,
		enhance: unpackEnhance
	} = superForm(data.unpackForm, {
		id: 'unpack-line',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			unpackingId = null;
			toast.success('Unpacked');
			refresh();
		}
	});

	const {
		form: eventData,
		errors: eventErrors,
		message: eventMessage,
		submitting: logging,
		enhance: eventEnhance
	} = superForm(data.eventForm, {
		id: 'log-shipment-event',
		validators: zod4Client(logEventSchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			scanOpen = false;
			toast.success('Scan logged');
			refresh();
		}
	});
</script>

<div class="space-y-6">
	<!-- The way back, what it is, and where the carrier last saw it. -->
	<PageHeader.Root>
		<div class="flex min-w-0 items-center gap-3">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button {...props} href="/shipments" variant="ghost" size="icon" class="shrink-0">
							<ArrowLeftIcon />
							<span class="sr-only">All {terms.plural}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>All {terms.plural}</Tooltip.Content>
			</Tooltip.Root>
			<div class="min-w-0">
				<p class="text-muted-foreground text-xs">
					{#if data.shipment.orders}
						{#if data.canOpenOrder}
							<a href="/orders/{data.shipment.orders.id}" class="hover:underline">
								{data.shipment.orders.number}
							</a>
						{:else}
							{data.shipment.orders.number}
						{/if}
					{/if}
					{#if data.shipment.companies}
						<span aria-hidden="true"> · </span>
						{#if data.canOpenParty}
							<a href="/companies/{data.shipment.companies.id}" class="hover:underline">
								{data.shipment.companies.name}
							</a>
						{:else}
							{data.shipment.companies.name}
						{/if}
					{/if}
				</p>
				<div class="flex items-center gap-2">
					<PageHeader.Title>
						{data.shipment.tracking_number ?? 'Untracked shipment'}
					</PageHeader.Title>
					<StatusBadge tone={SHIPMENT_DELIVERY_TONE[data.shipment.delivery_status]}>
						{deliveryLabel(data.shipment.delivery_status)}
					</StatusBadge>
				</div>
			</div>
		</div>
		<PageHeader.Actions>
			{#if data.canManage}
				<div class="w-52">
					<Label class="sr-only" for="delivery-status">Where the carrier last saw it</Label>
					<Combobox
						id="delivery-status"
						options={statusOptions}
						value={data.shipment.delivery_status}
						onchange={moveBox}
					/>
				</div>
				<Button variant="outline" onclick={() => (editOpen = true)}>Edit</Button>
			{/if}
		</PageHeader.Actions>
	</PageHeader.Root>

	<FormAlert message={$statusMessage} />

	{#if data.shipment.tracking_error}
		<!-- Non-null means live tracking is not running for this box. -->
		<FormAlert message={data.shipment.tracking_error} />
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each [['Carrier', data.shipment.carrier], ['Shipped', data.shipment.ship_date === null ? null : when(data.shipment.ship_date)], ['Due', data.shipment.estimated_delivery_date === null ? null : when(data.shipment.estimated_delivery_date)], ['Delivered', data.shipment.delivered_at === null ? null : when(data.shipment.delivered_at)]] as [label, value] (label)}
			<Card.Root>
				<Card.Content>
					<p class="text-muted-foreground text-xs">{label}</p>
					<p class="text-sm">{value ?? '—'}</p>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<!-- What is in the box. A line is in one box only, so packing it here is
	     also what takes it out of the pool the other boxes can draw on. -->
	<Card.Root>
		<Card.Header>
			<Card.Title>What is inside</Card.Title>
			<Card.Description>
				Whole {orderTerms.noun} lines — a packing row carries no quantity, so shipping part of a line
				is a split on the {orderTerms.noun}.
			</Card.Description>
			{#if data.canManage}
				<Card.Action>
					<Button size="sm" onclick={() => (packOpen = true)} disabled={data.packable.length === 0}>
						<PlusIcon />
						Pack a line
					</Button>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="p-0">
			{#if packed.length === 0}
				<Empty.Root class="py-10">
					<Empty.Media variant="icon"><PackageIcon /></Empty.Media>
					<Empty.Title>The box is empty</Empty.Title>
					<Empty.Description>
						Pack the lines going out in it, then move it along as the carrier reports.
					</Empty.Description>
				</Empty.Root>
			{:else}
				<ul class="divide-border divide-y">
					{#each packed as row (row.order_line_item_id)}
						{@const line = row.order_line_items}
						<li class="flex flex-wrap items-center gap-3 px-6 py-4">
							<span class="font-medium">{line.description}</span>
							{#if line.product_sku_snapshot}
								<span class="text-muted-foreground text-xs">{line.product_sku_snapshot}</span>
							{/if}
							<StatusBadge tone={LINE_FULFILLMENT_TONE[line.fulfillment_status]}>
								{line.fulfillment_status}
							</StatusBadge>
							<span class="text-muted-foreground ms-auto text-sm tabular-nums">
								{line.quantity} × {money(line.unit_price)}
							</span>
							{#if data.canManage}
								<Button
									size="sm"
									variant="ghost"
									onclick={() => (unpackingId = row.order_line_item_id)}
								>
									<Trash2Icon />
									<span class="sr-only">Unpack {line.description}</span>
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<FormAlert message={$packMessage} class="mx-6 mb-4" />
			<FormAlert message={$unpackMessage} class="mx-6 mb-4" />
		</Card.Content>
	</Card.Root>

	<!-- The carrier's scans, newest first. Append-only: a wrong scan is
	     corrected by the next one, never by rewriting history. -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Tracking</Card.Title>
			<Card.Description>
				What the carrier said, in its own words. The mapped status is on the box above.
			</Card.Description>
			{#if data.canManage}
				<Card.Action>
					<Button size="sm" variant="outline" onclick={() => (scanOpen = true)}>
						<PlusIcon />
						Log a scan
					</Button>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="p-0">
			{#if scans.length === 0}
				<Empty.Root class="py-10">
					<Empty.Media variant="icon"><TruckIcon /></Empty.Media>
					<Empty.Title>No scans yet</Empty.Title>
					<Empty.Description>Nothing has been reported against this box.</Empty.Description>
				</Empty.Root>
			{:else}
				<ol class="divide-border divide-y">
					{#each scans as scan (scan.id)}
						<li class="space-y-1 px-6 py-4">
							<div class="flex flex-wrap items-baseline gap-x-3">
								<span class="text-sm font-medium">{scan.message}</span>
								<span class="text-muted-foreground ms-auto text-xs">
									{stamp(scan.occurred_at)}
								</span>
							</div>
							<p class="text-muted-foreground text-xs">
								{#if scan.status}{scan.status}{/if}
								{#if scan.city || scan.region}
									<span aria-hidden="true"> · </span>{[scan.city, scan.region]
										.filter(Boolean)
										.join(', ')}
								{/if}
							</p>
						</li>
					{/each}
				</ol>
			{/if}
			<FormAlert message={$eventMessage} class="mx-6 mb-4" />
		</Card.Content>
	</Card.Root>

	{#if data.shipment.notes}
		<Card.Root>
			<Card.Header><Card.Title>Notes</Card.Title></Card.Header>
			<Card.Content>
				<p class="text-sm whitespace-pre-wrap">{data.shipment.notes}</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<!-- The status picker posts through this. -->
<form
	method="POST"
	action="?/setStatus"
	use:statusEnhance
	bind:this={statusFormEl}
	class="hidden"
	aria-hidden="true"
>
	<input type="hidden" name="delivery_status" bind:value={$statusData.delivery_status} />
</form>

<!-- The box itself. -->
<Modal.Root bind:open={editOpen}>
	<Modal.Content>
		<form method="POST" action="?/edit" use:editEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><TruckIcon /> Edit shipment</Modal.Title>
					<Modal.Description>
						Which {orderTerms.noun} it is against never changes — moving a packed box to another one would
						restate both, so that is a new shipment.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$editMessage} class="mb-0" />
					<div class="grid gap-2">
						<Label for="edit-supplier">Shipped by</Label>
						<Combobox
							id="edit-supplier"
							name="supplier_id"
							options={supplierOptions}
							bind:value={$editData.supplier_id}
						/>
					</div>
					<div class="grid gap-2 sm:grid-cols-2">
						<div class="grid gap-2">
							<Label for="edit-carrier">Carrier</Label>
							<Input
								id="edit-carrier"
								name="carrier"
								placeholder="UPS"
								bind:value={$editData.carrier}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="edit-tracking">Tracking number</Label>
							<Input
								id="edit-tracking"
								name="tracking_number"
								aria-invalid={$editErrors.tracking_number ? 'true' : undefined}
								bind:value={$editData.tracking_number}
							/>
							{#if $editErrors.tracking_number}
								<p class="text-destructive text-sm">{$editErrors.tracking_number}</p>
							{/if}
						</div>
					</div>
					<div class="grid gap-2">
						<Label for="edit-tracking-url">Tracking link</Label>
						<Input
							id="edit-tracking-url"
							name="tracking_url"
							placeholder="https://…"
							aria-invalid={$editErrors.tracking_url ? 'true' : undefined}
							bind:value={$editData.tracking_url}
						/>
						{#if $editErrors.tracking_url}
							<p class="text-destructive text-sm">{$editErrors.tracking_url}</p>
						{/if}
					</div>
					<div class="grid gap-2 sm:grid-cols-2">
						<div class="grid gap-2">
							<Label for="edit-ship-date">Ship date</Label>
							<Input
								id="edit-ship-date"
								name="ship_date"
								type="date"
								bind:value={$editData.ship_date}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="edit-due">Estimated delivery</Label>
							<Input
								id="edit-due"
								name="estimated_delivery_date"
								type="date"
								bind:value={$editData.estimated_delivery_date}
							/>
						</div>
					</div>
					<div class="grid gap-2">
						<Label for="edit-notes">Notes</Label>
						<Textarea id="edit-notes" name="notes" bind:value={$editData.notes} />
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$saving}>
					{$saving ? 'Saving…' : 'Save'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Pack a line. -->
<Modal.Root bind:open={packOpen}>
	<Modal.Content>
		<form method="POST" action="?/pack" use:packEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><PackageIcon /> Pack a line</Modal.Title>
					<Modal.Description>
						This {orderTerms.noun}'s lines that are not in a box yet. A line goes in one box only,
						so a line already packed is not offered here.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$packMessage} class="mb-0" />
					<div class="grid gap-2">
						<Label for="pack-line">Line</Label>
						<Combobox
							id="pack-line"
							name="order_line_item_id"
							options={packableOptions}
							bind:value={$packData.order_line_item_id}
						/>
					</div>
					{#if movesTheOrder(data.shipment.delivery_status)}
						<p class="text-muted-foreground text-sm">
							This box is already moving, so packing a line marks it
							{data.shipment.delivery_status === 'delivered' ? 'delivered' : 'shipped'} straight away.
						</p>
					{/if}
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$packing}>
					{$packing ? 'Packing…' : 'Pack'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Unpack a line. -->
<Modal.Root
	open={unpacking !== null}
	onOpenChange={(open) => {
		if (!open) unpackingId = null;
	}}
>
	<Modal.Content>
		{#if unpacking}
			<form method="POST" action="?/unpack" use:unpackEnhance>
				<input type="hidden" name="order_line_item_id" value={unpacking.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Take this out of the box?</Modal.Title>
						<Modal.Description>
							{unpacking.description} — it goes back in the pool, and can be packed into another box.
							Where it stands now is left as it is: a scan already reported is still true.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body><FormAlert message={$unpackMessage} class="mb-0" /></Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Keep it</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" disabled={$unpackingBusy}>
						{$unpackingBusy ? 'Unpacking…' : 'Unpack'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>

<!-- Log a scan. -->
<Modal.Root bind:open={scanOpen}>
	<Modal.Content>
		<form method="POST" action="?/logEvent" use:eventEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><TruckIcon /> Log a scan</Modal.Title>
					<Modal.Description>
						The carrier's own words. This is a record of what was said — it does not move the box;
						the status picker above does that.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$eventMessage} class="mb-0" />
					<div class="grid gap-2">
						<Label for="scan-message">What was reported</Label>
						<Input
							id="scan-message"
							name="message"
							placeholder="Arrived at facility"
							aria-invalid={$eventErrors.message ? 'true' : undefined}
							bind:value={$eventData.message}
						/>
						{#if $eventErrors.message}
							<p class="text-destructive text-sm">{$eventErrors.message}</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="scan-when">When</Label>
						<Input
							id="scan-when"
							name="occurred_at"
							type="datetime-local"
							aria-invalid={$eventErrors.occurred_at ? 'true' : undefined}
							bind:value={$eventData.occurred_at}
						/>
						{#if $eventErrors.occurred_at}
							<p class="text-destructive text-sm">{$eventErrors.occurred_at}</p>
						{/if}
					</div>
					<div class="grid gap-2 sm:grid-cols-3">
						<div class="grid gap-2">
							<Label for="scan-status">Carrier status</Label>
							<Input id="scan-status" name="status" bind:value={$eventData.status} />
						</div>
						<div class="grid gap-2">
							<Label for="scan-city">City</Label>
							<Input id="scan-city" name="city" bind:value={$eventData.city} />
						</div>
						<div class="grid gap-2">
							<Label for="scan-region">Region</Label>
							<Input id="scan-region" name="region" bind:value={$eventData.region} />
						</div>
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$logging}>
					{$logging ? 'Logging…' : 'Log scan'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
