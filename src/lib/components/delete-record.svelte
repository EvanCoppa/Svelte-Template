<script lang="ts">
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { recordTerms, type RecordKind } from '$lib/crm/records';
	import { deleteRecordSchema } from '$lib/schemas/records';

	/**
	 * The one delete confirmation behind every generic list page's row menu.
	 *
	 * A list page passes the kind of record it holds, the empty delete form its
	 * load built (`loadDeleteRecord()` in `$lib/server/records.ts`), and the
	 * query key its list depends on (`deleteRecordQuery()`, same module). Which
	 * row is being removed is the page's own state — `removing`, set by the row
	 * menu's Delete item — so one modal serves every row without a copy per
	 * kind. The post is `?/deleteRecord` on the page it was opened from, which
	 * delegates straight back to `deleteRecord()`.
	 */
	let {
		type,
		form: data,
		query,
		removing = $bindable(null)
	}: {
		type: RecordKind;
		form: SuperValidated<{ id: string }>;
		/** The list this removes a row from, so the page refreshes and nothing else does. */
		query: string;
		/** The row being removed, or null when the modal is closed. */
		removing?: { id: string; name: string } | null;
	} = $props();

	const terms = $derived(recordTerms(page.data.terms, type));

	const { message, submitting, enhance } = superForm(data, {
		id: 'delete-record',
		validators: zod4Client(deleteRecordSchema),
		invalidateAll: false,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			removing = null;
			toast.success(`${terms.noun} deleted`);
			invalidate(query);
		}
	});
</script>

<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removing = null;
	}}
>
	<Modal.Content>
		{#if removing}
			<form method="POST" action="?/deleteRecord" use:enhance>
				<input type="hidden" name="id" value={removing.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Delete {removing.name}?</Modal.Title>
						<Modal.Description>This can't be undone.</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$message} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" disabled={$submitting}>
						{$submitting ? 'Deleting…' : 'Delete'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
