<script lang="ts">
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { TagBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { Address } from '$lib/server/crm/addresses';
	import { capitalize } from '$lib/utils.js';
	import { ADDRESS_KINDS, addressSchema, removeAddressSchema } from '$lib/schemas/addresses';

	/**
	 * A party's addresses, and the one form that edits them. The page owns the
	 * rows and the forms its load built; this part draws the card, opens the
	 * modal on "Add" or an address's pencil, and posts to the record page's
	 * `?/saveAddress` / `?/removeAddress` — whose action geocodes what it
	 * saves, which is how a record earns a pin on a view's map.
	 */
	let {
		addresses,
		form: addressForm,
		removeForm,
		canManage,
		noun,
		queryKey
	}: {
		addresses: Address[];
		form: SuperValidated<Infer<typeof addressSchema>>;
		removeForm: SuperValidated<Infer<typeof removeAddressSchema>>;
		canManage: boolean;
		/** What the record is called — "this contact". */
		noun: string;
		/** The record's own query key, refreshed after every save. */
		queryKey: string;
	} = $props();

	const KIND_OPTIONS = ADDRESS_KINDS.map((kind) => ({ value: kind, label: capitalize(kind) }));

	let editorOpen = $state(false);
	let removingId = $state<string | null>(null);
	const removing = $derived(addresses.find((address) => address.id === removingId) ?? null);

	const { form, errors, message, constraints, submitting, enhance, reset } = superForm(
		addressForm,
		{
			id: 'address',
			validators: zod4Client(addressSchema),
			invalidateAll: false,
			resetForm: false,
			onUpdated({ form: result }) {
				if (!result.valid) return;
				editorOpen = false;
				toast.success('Address saved');
				invalidate(queryKey);
			}
		}
	);

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(removeForm, {
		id: 'remove-address',
		invalidateAll: false,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			removingId = null;
			toast.success('Address removed');
			invalidate(queryKey);
		}
	});

	function startAdding() {
		reset();
		editorOpen = true;
	}

	function startEditing(address: Address) {
		$form = {
			id: address.id,
			kind: address.kind,
			label: address.label ?? '',
			line1: address.line1,
			line2: address.line2 ?? '',
			city: address.city ?? '',
			region: address.region ?? '',
			postal_code: address.postal_code ?? '',
			country: address.country ?? '',
			is_primary: address.is_primary
		};
		editorOpen = true;
	}

	/** The text fields, in the order the form asks for them. */
	const FIELDS = [
		{ name: 'line1', label: 'Street', placeholder: '1007 Mountain Drive', wide: true },
		{ name: 'line2', label: 'Street, line 2', placeholder: 'Suite 400', wide: true },
		{ name: 'city', label: 'City', placeholder: 'Gotham' },
		{ name: 'region', label: 'State or region', placeholder: 'NJ' },
		{ name: 'postal_code', label: 'Postal code', placeholder: '07001' },
		{ name: 'country', label: 'Country code', placeholder: 'US' },
		{ name: 'label', label: 'Label', placeholder: 'Head office', wide: true }
	] as const;
</script>

<Card.Root data-slot="detail-addresses">
	<Card.Header>
		<Card.Title>Addresses</Card.Title>
		{#if canManage}
			<Card.Action>
				<Button variant="outline" size="sm" onclick={startAdding}>
					<PlusIcon />
					Add address
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="grid gap-3 sm:grid-cols-2">
		{#each addresses as address (address.id)}
			<address class="border-border space-y-1.5 rounded-lg border p-3 text-sm not-italic">
				<div class="flex items-center gap-2">
					<TagBadge tone={address.is_primary ? 'info' : 'neutral'} class="capitalize">
						{address.kind}
					</TagBadge>
					{#if address.label}
						<span class="text-muted-foreground truncate text-xs">{address.label}</span>
					{/if}
					{#if address.latitude !== null && address.longitude !== null}
						<MapPinIcon class="text-muted-foreground size-3.5" aria-label="On the map" />
					{/if}
					{#if canManage}
						<span class="ml-auto flex items-center gap-0.5">
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								title="Edit address"
								onclick={() => startEditing(address)}
							>
								<PencilIcon class="size-3.5" />
								<span class="sr-only">Edit address</span>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								title="Remove address"
								onclick={() => (removingId = address.id)}
							>
								<Trash2Icon class="size-3.5" />
								<span class="sr-only">Remove address</span>
							</Button>
						</span>
					{/if}
				</div>
				<p>{address.line1}</p>
				{#if address.line2}
					<p>{address.line2}</p>
				{/if}
				<p>
					{[address.city, address.region].filter(Boolean).join(', ')}
					{address.postal_code ?? ''}
				</p>
				{#if address.country}
					<p class="text-muted-foreground">{address.country}</p>
				{/if}
			</address>
		{:else}
			<Empty.Root class="p-6 sm:col-span-2">
				<Empty.Header>
					<Empty.Title class="text-base">No addresses yet</Empty.Title>
					<Empty.Description>
						Where this {noun} is. An address with a match on the map puts the {noun} on every view that
						draws one.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/each}
	</Card.Content>
</Card.Root>

<Modal.Root bind:open={editorOpen}>
	<Modal.Content>
		<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
		<form method="POST" action="?/saveAddress" use:enhance>
			<input type="hidden" name="id" value={$form.id} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title>
						<MapPinIcon />
						{$form.id === '' ? 'New address' : 'Edit address'}
					</Modal.Title>
					<Modal.Description>
						Saved addresses are located automatically when a geocoder is configured.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$message} class="mb-0" />
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="grid gap-2">
							<Label for="address-kind">Kind</Label>
							<Combobox
								id="address-kind"
								name="kind"
								options={KIND_OPTIONS}
								bind:value={$form.kind}
								searchable={false}
							/>
						</div>
						<div class="flex items-end gap-2 pb-2">
							<Checkbox id="address-primary" name="is_primary" bind:checked={$form.is_primary} />
							<Label for="address-primary">Primary address</Label>
						</div>
						{#each FIELDS as field (field.name)}
							<div class={['grid gap-2', 'wide' in field && field.wide && 'sm:col-span-2']}>
								<Label for={`address-${field.name}`}>{field.label}</Label>
								<Input
									id={`address-${field.name}`}
									name={field.name}
									placeholder={field.placeholder}
									aria-invalid={$errors[field.name] ? 'true' : undefined}
									bind:value={$form[field.name]}
									{...$constraints[field.name]}
								/>
								{#if $errors[field.name]}
									<p class="text-destructive text-sm">{$errors[field.name]}</p>
								{/if}
							</div>
						{/each}
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$submitting}>
					{$submitting ? 'Saving…' : 'Save address'}
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
			<form method="POST" action="?/removeAddress" use:removeEnhance>
				<input type="hidden" name="id" value={removing.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Remove this address?</Modal.Title>
						<Modal.Description>
							{removing.line1} goes; the {noun} stays.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$deleting}>
						{$deleting ? 'Removing…' : 'Remove address'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
