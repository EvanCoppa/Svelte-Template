<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { recordTerms } from '$lib/crm/records';
	import {
		RECORD_FORMS,
		RECORD_SCHEMAS,
		type RecordField,
		type RecordFormValues,
		type RecordType
	} from '$lib/schemas/records';
	import { capitalize, cn } from '$lib/utils.js';

	/**
	 * The one "Add …" button, and the one form behind it.
	 *
	 * A list page passes the kind of record it holds and the empty form its
	 * load built (`loadCreateRecord()` in `$lib/server/records.ts`); the fields,
	 * the labels and the validation all come from the registry entry for that
	 * kind, so every object type gets the same form without a page writing one.
	 * What the record is CALLED comes from the terms the layout shipped — the
	 * feature's word as the org's industry says it, "Add quote" in a roofer.
	 * The post is an ordinary form action on the page it was opened from —
	 * `?/create`, which delegates straight back to `createRecord()`.
	 *
	 * `type` is fixed for the lifetime of the component: a page creates one kind
	 * of record, and superForm is wired once at init.
	 */
	let {
		type,
		form: data,
		action = '?/create'
	}: {
		type: RecordType;
		form: SuperValidated<RecordFormValues>;
		/** Only when the create action lives somewhere other than this page's `?/create`. */
		action?: string;
	} = $props();

	const definition = RECORD_FORMS[type];
	const terms = $derived(recordTerms(page.data.terms, type));

	let open = $state(false);

	const { form, errors, message, constraints, submitting, enhance } = superForm(data, {
		validators: zod4Client(RECORD_SCHEMAS[type]),
		// Only the list this adds a row to is stale (docs/data-invalidation.md).
		invalidateAll: false,
		onSubmit({ formData }) {
			// A `datetime-local` field posts wall-clock time with no offset, which
			// only the browser can resolve. Rewrite it to an instant on the way
			// out; the schema accepts both, so the no-JS path still posts.
			for (const field of definition.fields) {
				if (field.type !== 'datetime') continue;
				const picked = formData.get(field.name);
				if (picked === null || picked instanceof File || picked === '') continue;
				const at = new Date(picked);
				if (!Number.isNaN(at.getTime())) formData.set(field.name, at.toISOString());
			}
		},
		onUpdated({ form: result }) {
			if (!result.valid) return;
			open = false;
			toast.success(`${capitalize(terms.noun)} created`);
			invalidate(definition.query);
		}
	});

	function fieldId(field: RecordField): string {
		return `create-${type}-${field.name}`;
	}

	function inputType(field: RecordField) {
		switch (field.type) {
			case 'datetime':
				return 'datetime-local' as const;
			case 'email':
				return 'email' as const;
			case 'tel':
				return 'tel' as const;
			case 'number':
				return 'number' as const;
			case 'date':
				return 'date' as const;
			default:
				return 'text' as const;
		}
	}
</script>

<Modal.Root bind:open>
	<Modal.Trigger>
		{#snippet child({ props })}
			<Button {...props}>
				<PlusIcon />
				Add {terms.noun}
			</Button>
		{/snippet}
	</Modal.Trigger>

	<!-- Roomier than the default tray: these forms lay their fields out in two columns. -->
	<Modal.Content class="sm:max-w-2xl">
		<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
		<form method="POST" {action} use:enhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><PlusIcon /> New {terms.noun}</Modal.Title>
				</Modal.Header>
				<Modal.Body class="grid gap-5 pt-1 sm:grid-cols-2">
					<FormAlert message={$message} class="mb-0 sm:col-span-2" />

					{#each definition.fields as field (field.name)}
						{@const id = fieldId(field)}
						{@const invalid = Boolean($errors[field.name])}
						<div class={cn('grid gap-2', field.wide && 'sm:col-span-2')}>
							<Label for={id}>{field.label}</Label>

							{#if field.type === 'select'}
								<Combobox
									{id}
									name={field.name}
									bind:value={$form[field.name]}
									options={field.options ?? []}
									{invalid}
								/>
							{:else if field.type === 'textarea'}
								<Textarea
									{id}
									name={field.name}
									placeholder={field.placeholder}
									aria-invalid={invalid ? 'true' : undefined}
									aria-describedby={invalid ? `${id}-error` : undefined}
									bind:value={$form[field.name]}
									{...$constraints[field.name] ?? {}}
								/>
							{:else}
								<Input
									{id}
									name={field.name}
									type={inputType(field)}
									placeholder={field.placeholder}
									step={field.type === 'number' ? '0.01' : undefined}
									aria-invalid={invalid ? 'true' : undefined}
									aria-describedby={invalid ? `${id}-error` : undefined}
									bind:value={$form[field.name]}
									{...$constraints[field.name] ?? {}}
								/>
							{/if}

							{#if invalid}
								<p id="{id}-error" class="text-destructive text-sm">{$errors[field.name]}</p>
							{/if}
						</div>
					{/each}
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$submitting}>
					{$submitting ? 'Creating…' : `Create ${terms.noun}`}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
