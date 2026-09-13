<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { toast } from 'svelte-sonner';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import * as Modal from '$lib/components/modal/index.js';
	import RecordFields from '$lib/components/record-fields.svelte';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { QUERY } from '$lib/queries';
	import {
		RECORD_FORMS,
		RECORD_SCHEMAS,
		type RecordFormValues,
		type RecordPickers,
		type RecordType
	} from '$lib/schemas/records';
	import { capitalize } from '$lib/utils.js';

	/**
	 * The one "Edit" button, and the same form behind it.
	 *
	 * The mirror of `CreateRecord`: the record page passes the kind and the
	 * form its load filled in from the row (`loadEditRecord()` in
	 * `$lib/server/records.ts`), and the fields, the labels and the validation
	 * come from the same registry entry — so a field only has to be described
	 * once to be creatable, editable and validated the same way in both.
	 *
	 * A deal's stage is in that list, which is what makes this the way a deal
	 * moves down the funnel.
	 *
	 * Two things are stale after a save and nothing else is: this record's own
	 * page and the list it appears in (docs/data-invalidation.md).
	 */
	let {
		type,
		recordId,
		form: data,
		pickers = {}
	}: {
		type: RecordType;
		/** The row being edited — the record page's own id, for the freshness key. */
		recordId: string;
		form: SuperValidated<RecordFormValues>;
		/** The options behind each picker field, as `loadEditRecord()` read them. */
		pickers?: RecordPickers;
	} = $props();

	const definition = RECORD_FORMS[type];
	const terms = $derived(recordTerms(page.data.terms, type));

	let open = $state(false);

	const superform = superForm(data, {
		validators: zod4Client(RECORD_SCHEMAS[type]),
		invalidateAll: false,
		// What was just saved is what the record says now, so the form keeps it
		// rather than snapping back to the values the page loaded with.
		resetForm: false,
		onSubmit({ formData }) {
			// The wall clock the browser showed, back to the instant the column
			// holds — the same rewrite `CreateRecord` does, for the same reason.
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
			toast.success(`${capitalize(terms.noun)} saved`);
			invalidate(QUERY.record(type, recordId));
			invalidate(definition.query);
		}
	});
	const { message, submitting, enhance } = superform;
</script>

<Modal.Root bind:open>
	<Modal.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline">
				<PencilIcon />
				Edit
			</Button>
		{/snippet}
	</Modal.Trigger>

	<Modal.Content class="sm:max-w-2xl">
		<form method="POST" action="?/edit" use:enhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><PencilIcon /> Edit {terms.noun}</Modal.Title>
				</Modal.Header>
				<Modal.Body class="grid gap-5 pt-1 sm:grid-cols-2">
					<FormAlert message={$message} class="mb-0 sm:col-span-2" />
					<RecordFields {type} {superform} {pickers} idPrefix="edit" />
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$submitting}>
					{$submitting ? 'Saving…' : 'Save changes'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
