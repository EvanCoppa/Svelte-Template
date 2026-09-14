<script lang="ts">
	import Link2Icon from '@lucide/svelte/icons/link-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import WaypointsIcon from '@lucide/svelte/icons/waypoints';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Relationship from './detail-relationship.svelte';
	import { recordTerms, type RecordKind } from '$lib/crm/records';
	import type { RelationshipTypeOption } from '$lib/crm/relationships';
	import { term } from '$lib/features/vocabulary';
	import type { RelationshipView } from '$lib/server/crm/relationships';
	import {
		addRelationshipSchema,
		removeRelationshipSchema,
		type RelationshipOtherKind
	} from '$lib/schemas/relationships';

	/**
	 * The record page's Relationships card, and the write side
	 * docs/relationships.md flags as not built yet: a type-and-direction
	 * picker, then a kind picker across every other record kind (skipped when
	 * the type already says which kind the other side must be), then that
	 * kind's own record picker. The page owns the rows and the choices its
	 * load built; this part draws the card, opens the modal on "Add
	 * relationship", fetches the record picker's options as the reader
	 * chooses a kind, and posts to the record page's `?/addRelationship` /
	 * `?/removeRelationship` — the addresses part's one-card-one-modal shape.
	 */
	let {
		relationships,
		typeOptions,
		otherKinds,
		canManage,
		form: addForm,
		removeForm,
		graphHref,
		noun,
		queryKey
	}: {
		relationships: RelationshipView[];
		typeOptions: RelationshipTypeOption[];
		/** The other kinds a type with no fixed side lets the reader point at. */
		otherKinds: RelationshipOtherKind[];
		canManage: boolean;
		form: SuperValidated<Infer<typeof addRelationshipSchema>>;
		removeForm: SuperValidated<Infer<typeof removeRelationshipSchema>>;
		/** Where this record's whole graph is drawn, or null when it isn't open to this reader. */
		graphHref: string | null;
		/** What the record is called — "this contact". */
		noun: string;
		/** The record's own query key, refreshed after every change. */
		queryKey: string;
	} = $props();

	/** What a kind is called, the industry's word — the same namer the related-record tabs use. */
	function labelFor(kind: string): string {
		if (kind === 'member') return term(page.data.vocabulary, 'graph_member');
		// SAFETY: every `kind` this function sees comes from `otherKinds` or a
		// `RelationshipTypeOption.otherKind`, both `RelationshipOtherKind` —
		// `RecordKind` with 'member', just excluded above.
		return recordTerms(page.data.terms, kind as RecordKind).name;
	}

	const kindOptions = $derived(otherKinds.map((kind) => ({ value: kind, label: labelFor(kind) })));

	let adding = $state(false);
	let removingId = $state<string | null>(null);
	const removing = $derived(relationships.find((r) => r.id === removingId) ?? null);

	const { form, message, submitting, enhance, reset } = superForm(addForm, {
		id: 'add-relationship',
		validators: zod4Client(addRelationshipSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			adding = false;
			toast.success('Relationship added');
			invalidate(queryKey);
		}
	});

	// The type+direction choice, kept apart from the superform's own store:
	// posting `typeId` and `direction` as two fields is the server action's
	// business, but the reader picks both from one dropdown.
	let selectedType = $state('');
	const selectedTypeOption = $derived(typeOptions.find((o) => o.value === selectedType) ?? null);
	const needsKindPicker = $derived(
		selectedTypeOption !== null && selectedTypeOption.otherKind === null
	);

	let otherOptions = $state<{ value: string; label: string }[]>([]);
	let loadingOptions = $state(false);

	async function loadOtherOptions(kind: string) {
		$form.otherId = '';
		otherOptions = [];
		loadingOptions = true;
		try {
			const response = await fetch(`relationship-options?kind=${encodeURIComponent(kind)}`);
			otherOptions = response.ok ? await response.json() : [];
		} finally {
			loadingOptions = false;
		}
	}

	function onTypeChange(value: string) {
		selectedType = value;
		const option = typeOptions.find((o) => o.value === value);
		const [typeId, direction] = value.split(':');
		$form.typeId = typeId ?? '';
		$form.direction = direction === 'inverse' ? 'inverse' : 'forward';
		$form.otherKind = option?.otherKind ?? '';
		$form.otherId = '';
		otherOptions = [];
		if (option?.otherKind) loadOtherOptions(option.otherKind);
	}

	function onKindChange(kind: string) {
		loadOtherOptions(kind);
	}

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(removeForm, {
		id: 'remove-relationship',
		invalidateAll: false,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			removingId = null;
			toast.success('Relationship removed');
			invalidate(queryKey);
		}
	});

	function startAdding() {
		reset();
		selectedType = '';
		otherOptions = [];
		adding = true;
	}
</script>

<Card.Root data-slot="detail-relationships">
	<Card.Header>
		<Card.Title>Relationships</Card.Title>
		<Card.Description>
			The records this {noun} is linked to — who holds it, where it came from, who it refers to.
		</Card.Description>
		{#if graphHref || canManage}
			<Card.Action>
				<div class="flex items-center gap-2">
					{#if graphHref}
						<Button variant="outline" size="sm" href={graphHref}>
							<WaypointsIcon />
							Open in graph
						</Button>
					{/if}
					{#if canManage}
						<Button variant="outline" size="sm" onclick={startAdding}>
							<PlusIcon />
							Add relationship
						</Button>
					{/if}
				</div>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if relationships.length > 0}
			<ul class="divide-border divide-y">
				{#each relationships as relationship (relationship.id)}
					<Relationship
						{relationship}
						onRemove={canManage ? () => (removingId = relationship.id) : undefined}
					/>
				{/each}
			</ul>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title class="text-base">No relationships yet</Empty.Title>
					<Empty.Description>
						Who holds this {noun}, where it came from, who it refers to — anything a column on the {noun}
						itself doesn't already say.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>

<Modal.Root bind:open={adding}>
	<Modal.Content>
		<form method="POST" action="?/addRelationship" use:enhance>
			<input type="hidden" name="typeId" value={$form.typeId} />
			<input type="hidden" name="direction" value={$form.direction} />
			{#if !needsKindPicker}
				<input type="hidden" name="otherKind" value={$form.otherKind} />
			{/if}
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><Link2Icon /> Add relationship</Modal.Title>
					<Modal.Description>
						What this {noun} is linked to, and how — across any kind of record.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body class="grid gap-4">
					<FormAlert message={$message} class="mb-0" />
					<div class="grid gap-2">
						<Label for="relationship-type">Relationship</Label>
						<Combobox
							id="relationship-type"
							options={typeOptions}
							value={selectedType}
							placeholder="Choose a relationship…"
							onchange={onTypeChange}
						/>
					</div>
					{#if needsKindPicker}
						<div class="grid gap-2">
							<Label for="relationship-kind">Kind of record</Label>
							<Combobox
								id="relationship-kind"
								name="otherKind"
								options={kindOptions}
								bind:value={$form.otherKind}
								placeholder="Choose a kind…"
								onchange={onKindChange}
							/>
						</div>
					{/if}
					{#if $form.otherKind}
						<div class="grid gap-2">
							<Label for="relationship-other">{labelFor($form.otherKind)}</Label>
							<Combobox
								id="relationship-other"
								name="otherId"
								options={otherOptions}
								bind:value={$form.otherId}
								disabled={loadingOptions}
								placeholder={loadingOptions
									? 'Loading…'
									: `Choose a ${labelFor($form.otherKind).toLowerCase()}…`}
							/>
						</div>
					{/if}
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$submitting || !$form.otherId}>
					{$submitting ? 'Adding…' : 'Add relationship'}
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
			<form method="POST" action="?/removeRelationship" use:removeEnhance>
				<input type="hidden" name="id" value={removing.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Remove this relationship?</Modal.Title>
						<Modal.Description>
							"{removing.label}
							{removing.other.name}" goes; both records stay.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$deleting}>
						{$deleting ? 'Removing…' : 'Remove relationship'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
