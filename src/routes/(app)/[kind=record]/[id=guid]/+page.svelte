<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TablePropertiesIcon from '@lucide/svelte/icons/table-properties';
	import * as Detail from '$lib/components/detail/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as Note from '$lib/components/note/index.js';
	import { CopyButton } from '$lib/components/enhanced/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { StatusBadge, TagBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { customFieldInputKind } from '$lib/crm/custom-fields';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { QUERY } from '$lib/queries';
	import type { CustomFieldEntry } from '$lib/server/crm/custom-fields';
	import { customFieldValueFormSchema } from './schema';
	import { canArchiveNote, canEditNote } from '$lib/notes';
	import { noteCommands } from '$lib/notes-api';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';
	import { capitalize } from '$lib/utils.js';

	let { data } = $props();

	// What this kind is called, as the org's industry says it — "Quote", "All quotes".
	const terms = $derived(recordTerms(page.data.terms, data.record.kind));
	// The record wears its feature's icon — the one its sidebar entry carries,
	// found the way the breadcrumb trail finds it.
	const KindIcon = $derived(iconFor(iconForPath(page.url.pathname, page.data.nav ?? [])));

	/** Who logged an activity, or null when nobody can be named. */
	function author(userId: string | null): string | null {
		return userId === null ? null : (data.people.get(userId) ?? null);
	}

	// --- Editing one custom field -------------------------------------------
	//
	// One field at a time, addressed by id: the modal is retargeted rather than
	// rebuilt, so the form's schema stays flat and the value posts as a string
	// like every other field in the app.

	let editingFieldId = $state<string | null>(null);
	const editingField = $derived(
		data.customFieldEntries.find((entry) => entry.id === editingFieldId) ?? null
	);

	const {
		form: fieldData,
		errors: fieldErrors,
		message: fieldMessage,
		constraints: fieldConstraints,
		submitting: savingField,
		enhance: fieldEnhance
	} = superForm(data.customFieldForm, {
		validators: zod4Client(customFieldValueFormSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			editingFieldId = null;
			toast.success('Custom field saved');
			invalidate(QUERY.record(data.record.kind, data.record.id));
		}
	});

	function startEditingField(entry: CustomFieldEntry) {
		$fieldData = { field_definition_id: entry.id, value: entry.value };
		editingFieldId = entry.id;
	}

	/** A select's choices as the Combobox takes them. */
	const choiceOptions = $derived(
		(editingField?.choices ?? []).map((choice) => ({ value: choice, label: choice }))
	);

	/** Yes / no / not filled in — three states, so a picker rather than a switch. */
	const BOOLEAN_OPTIONS = [
		{ value: 'true', label: 'Yes' },
		{ value: 'false', label: 'No' }
	];

	/** The note the button just made, so the caret lands in it. */
	let addedNoteId = $state<string | null>(null);

	// A note written here is about this record: same table, same endpoint, same
	// editor as the dock — it is simply born attached.
	async function addNote() {
		const note = await noteCommands.create({
			entityType: data.record.kind,
			entityId: data.record.id
		});
		if (note) addedNoteId = note.id;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-2">
			<p class="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
				<KindIcon class="size-4" />
				{capitalize(terms.noun)}
			</p>
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="text-2xl font-bold tracking-tight">{data.record.name}</h1>
				{#each data.record.pills as pill (pill.label)}
					<StatusBadge tone={pill.tone}>{pill.label}</StatusBadge>
				{/each}
			</div>
			{#if data.tags.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each data.tags as tag (tag.id)}
						<TagBadge tone={tag.tone}>{tag.name}</TagBadge>
					{/each}
				</div>
			{/if}
		</div>

		<!-- The breadcrumb trail is the way back on a wide screen; this is the
		     way back everywhere else. -->
		<Button href={recordListHref(data.record.kind)} variant="outline">
			<ArrowLeftIcon />
			All {terms.plural}
		</Button>
	</div>

	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>Details</Card.Title>
				</Card.Header>
				<Card.Content>
					<dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2">
						{#each data.record.fields as field (field.label)}
							<Detail.Field label={field.label} value={field.value} people={data.people} />
						{/each}
					</dl>
				</Card.Content>
			</Card.Root>

			{#if data.customFields.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Custom fields</Card.Title>
						<Card.Description>
							What this organization records about its {terms.plural} beyond the built-in columns.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2">
							{#each data.customFields as field (field.key)}
								{@const entry = data.customFieldEntries.find((row) => row.key === field.key)}
								<Detail.Field label={field.label} value={field.value}>
									{#snippet action()}
										{#if data.canEditFields && entry}
											<Button
												variant="ghost"
												size="icon"
												class="size-6"
												onclick={() => startEditingField(entry)}
											>
												<PencilIcon class="size-3" />
												<span class="sr-only">Edit {field.label}</span>
											</Button>
										{/if}
									{/snippet}
								</Detail.Field>
							{/each}
						</dl>
					</Card.Content>
				</Card.Root>
			{/if}

			{#if data.addresses.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Addresses</Card.Title>
					</Card.Header>
					<Card.Content class="grid gap-3 sm:grid-cols-2">
						{#each data.addresses as address (address.id)}
							<address class="border-border space-y-1.5 rounded-lg border p-3 text-sm not-italic">
								<div class="flex items-center gap-2">
									<TagBadge tone={address.is_primary ? 'info' : 'neutral'} class="capitalize">
										{address.kind}
									</TagBadge>
									{#if address.label}
										<span class="text-muted-foreground truncate text-xs">{address.label}</span>
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
						{/each}
					</Card.Content>
				</Card.Root>
			{/if}

			{#each data.related as group (group.kind)}
				{@const related = recordTerms(page.data.terms, group.kind)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{related.name}</Card.Title>
						<Card.Description>
							{group.records.length === 1
								? `One ${related.noun}`
								: `${String(group.records.length)} ${related.plural}`}
							linked to this {terms.noun}.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<ul class="divide-border divide-y">
							{#each group.records as record (record.id)}
								<Detail.Related {record} />
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>

		<aside class="space-y-6">
			{#if data.notes}
				{@const notes = data.notes}
				<Card.Root>
					<Card.Header>
						<Card.Title>Notes</Card.Title>
						<Card.Description>
							Written down about this {terms.noun}. They sit on the dock with every other note.
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-3">
						{#each notes.open as note (note.id)}
							<Note.Card color={note.color} class="h-40">
								<Note.Editor
									{note}
									editable={canEditNote(note, notes)}
									autofocus={note.id === addedNoteId}
									bodyClass="flex-1 field-sizing-fixed"
									onsave={(patch) => noteCommands.save(note.id, patch)}
								/>
								{#if canArchiveNote(note, notes)}
									<Note.Actions>
										<Note.Palette
											value={note.color}
											onpick={(color) => noteCommands.save(note.id, { color })}
										/>
										<Button
											variant="ghost"
											size="icon"
											class="size-7"
											title="Archive"
											onclick={() => noteCommands.archive(note.id, true)}
										>
											<ArchiveIcon class="size-4" />
											<span class="sr-only">Archive note</span>
										</Button>
									</Note.Actions>
								{/if}
							</Note.Card>
						{/each}

						{#if notes.canManage}
							<Button variant="outline" class="w-full" onclick={addNote}>
								<PlusIcon />
								New note
							</Button>
						{:else if notes.open.length === 0}
							<p class="text-muted-foreground text-sm">
								Nothing written down about this {terms.noun}.
							</p>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			<Card.Root>
				<Card.Header>
					<Card.Title>Activity</Card.Title>
					<Card.Description>
						Calls, emails, meetings and notes logged against this {terms.noun}, newest first.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.activities.length > 0}
						<ol class="space-y-5">
							{#each data.activities as activity (activity.id)}
								<Detail.Activity {activity} author={author(activity.author_id)} />
							{/each}
						</ol>
					{:else}
						<Empty.Root class="p-6">
							<Empty.Header>
								<Empty.Title class="text-base">Nothing logged yet</Empty.Title>
								<Empty.Description>
									Interactions with this {terms.noun} will show up here.
								</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Record</Card.Title>
				</Card.Header>
				<Card.Content>
					<dl class="space-y-4">
						<Detail.Field
							label="Created"
							value={{ type: 'datetime', value: data.record.createdAt }}
						/>
						<Detail.Field
							label="Created by"
							value={data.record.createdBy
								? { type: 'person', userId: data.record.createdBy }
								: { type: 'empty' }}
							people={data.people}
						/>
						<Detail.Field
							label="Last updated"
							value={{ type: 'datetime', value: data.record.updatedAt }}
						/>
						<div class="space-y-1">
							<dt class="text-muted-foreground text-sm">ID</dt>
							<dd class="flex items-center justify-between gap-2">
								<code class="font-mono text-xs break-all">{data.record.id}</code>
								<CopyButton value={data.record.id} label="Copy" copiedLabel="Copied" class="h-8" />
							</dd>
						</div>
					</dl>
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
</div>

<!-- Editing one custom field. The input is drawn by the definition's type — the
	record page never inspects a value to decide how to show or edit it. -->
<Modal.Root
	open={editingFieldId !== null}
	onOpenChange={(open) => {
		if (!open) editingFieldId = null;
	}}
>
	<Modal.Content>
		{#if editingField}
			<form method="POST" action="?/saveCustomField" use:fieldEnhance>
				<input type="hidden" name="field_definition_id" value={$fieldData.field_definition_id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><TablePropertiesIcon /> {editingField.label}</Modal.Title>
						<Modal.Description>Leave it empty to clear the field.</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$fieldMessage} class="mb-0" />
						<div class="grid gap-2">
							<Label for="custom-field-value">{editingField.label}</Label>
							{#if customFieldInputKind(editingField.valueType) === 'select'}
								<Combobox
									id="custom-field-value"
									name="value"
									options={choiceOptions}
									clearable
									bind:value={$fieldData.value}
									placeholder="Not set"
									invalid={Boolean($fieldErrors.value)}
								/>
							{:else if customFieldInputKind(editingField.valueType) === 'boolean'}
								<Combobox
									id="custom-field-value"
									name="value"
									options={BOOLEAN_OPTIONS}
									clearable
									bind:value={$fieldData.value}
									placeholder="Not set"
									invalid={Boolean($fieldErrors.value)}
								/>
							{:else if customFieldInputKind(editingField.valueType) === 'date'}
								<Input
									id="custom-field-value"
									name="value"
									type="date"
									aria-invalid={$fieldErrors.value ? 'true' : undefined}
									bind:value={$fieldData.value}
								/>
							{:else if customFieldInputKind(editingField.valueType) === 'number'}
								<Input
									id="custom-field-value"
									name="value"
									type="number"
									step="0.01"
									aria-invalid={$fieldErrors.value ? 'true' : undefined}
									bind:value={$fieldData.value}
								/>
							{:else}
								<Input
									id="custom-field-value"
									name="value"
									aria-invalid={$fieldErrors.value ? 'true' : undefined}
									bind:value={$fieldData.value}
									{...$fieldConstraints.value}
								/>
							{/if}
							{#if $fieldErrors.value}
								<p class="text-destructive text-sm">{$fieldErrors.value}</p>
							{/if}
						</div>
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$savingField}>
						{$savingField ? 'Saving…' : 'Save'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
