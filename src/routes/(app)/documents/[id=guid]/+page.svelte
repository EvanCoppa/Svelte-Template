<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { tick } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import { DocumentEditor } from '$lib/components/document-editor/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import type { DocumentBody } from '$lib/crm/documents';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { documentSaveSchema } from '$lib/schemas/documents';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'document'));

	/**
	 * One page, open.
	 *
	 * The autosave is a FORM ACTION, not a `fetch`: the mutation is born in a
	 * gesture on the page it lives on, so it goes through a hidden form filled
	 * from script and submitted with `requestSubmit()` — the road the
	 * calendar's drag-to-move takes (CLAUDE.md, "Server actions vs API
	 * endpoints"). The editor hands up a whole body; this page decides that
	 * means "save", and the action decides what that means to the database.
	 */
	let formEl = $state<HTMLFormElement | null>(null);

	let saved = $state(false);

	const { form, enhance, submitting, message } = superForm(data.form, {
		id: 'document-save',
		validators: zod4Client(documentSaveSchema),
		// A save is a keystroke's echo, not a navigation: resetting the form or
		// re-running every load on each one would fight the person typing.
		resetForm: false,
		invalidateAll: false,
		applyAction: false,
		// Somebody who types while a save is in flight must not lose the second
		// edit to the first one's reply.
		multipleSubmits: 'allow',
		onUpdated({ form: result }) {
			saved = result.valid;
		}
	});

	let titleTimer: ReturnType<typeof setTimeout> | null = null;

	async function submit() {
		// The hidden inputs take the store's values on the next flush — the
		// calendar's rule, and the reason a drag there awaits a tick too.
		await tick();
		formEl?.requestSubmit();
	}

	function onBody(body: DocumentBody) {
		saved = false;
		$form.body = JSON.stringify(body);
		void submit();
	}

	function schedule() {
		saved = false;
		if (titleTimer) clearTimeout(titleTimer);
		// Longer than the editor's own debounce: a name is typed in one go.
		titleTimer = setTimeout(() => void submit(), 600);
	}

	function onTitle(event: Event & { currentTarget: HTMLInputElement }) {
		$form.title = event.currentTarget.value;
		schedule();
	}

	function onIcon(event: Event & { currentTarget: HTMLInputElement }) {
		$form.icon = event.currentTarget.value;
		schedule();
	}
</script>

<div class="mx-auto w-full max-w-3xl space-y-6">
	<div class="flex items-center gap-2">
		<Button
			variant="ghost"
			size="icon"
			href={recordListHref('document')}
			aria-label="Back to {terms.name}"
		>
			<ArrowLeftIcon class="size-4" />
		</Button>
		<span class="text-muted-foreground text-sm">{terms.name}</span>
		<span class="text-muted-foreground ms-auto text-xs" aria-live="polite">
			{#if $submitting}
				Saving…
			{:else if saved}
				Saved
			{/if}
		</span>
	</div>

	<FormAlert message={$message} />

	<div class="flex items-start gap-3">
		<Input
			value={$form.icon}
			oninput={onIcon}
			readonly={!data.canEdit}
			maxlength={16}
			class="size-12 shrink-0 p-0 text-center text-2xl"
			aria-label="Icon"
			placeholder="📄"
		/>
		<Input
			value={$form.title}
			oninput={onTitle}
			readonly={!data.canEdit}
			maxlength={200}
			class="h-12 border-0 bg-transparent px-0 text-3xl font-semibold shadow-none focus-visible:ring-0 md:text-3xl"
			aria-label="Name"
			placeholder="Untitled"
		/>
	</div>

	<DocumentEditor
		body={data.document.body}
		terms={page.data.terms}
		readonly={!data.canEdit}
		onchange={onBody}
	/>
</div>

<!--
	The form the editor posts through. Hidden because there is nothing to fill
	in: every field is set from script as the page is written into.
-->
<form bind:this={formEl} method="POST" action="?/save" class="hidden" use:enhance>
	<input type="hidden" name="title" value={$form.title} />
	<input type="hidden" name="icon" value={$form.icon} />
	<input type="hidden" name="body" value={$form.body} />
</form>
