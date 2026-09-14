<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import Grid3x3Icon from '@lucide/svelte/icons/grid-3x3';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import RowActions from '$lib/components/row-actions.svelte';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { categoryTree, flattenTree, subtreeIds } from '$lib/crm/categories';
	import { recordTerms } from '$lib/crm/records';
	import { featureTerms } from '$lib/features/terms';
	import { QUERY } from '$lib/queries';
	import { createCategorySchema, updateCategorySchema } from './schema';

	let { data } = $props();

	const terms = $derived(featureTerms(page.data.terms, 'categories'));
	const productTerms = $derived(recordTerms(page.data.terms, 'product'));

	/**
	 * The tree, and the same tree flattened back to rows in reading order. The
	 * nesting is `$lib/crm/categories`' job, not this page's — the category
	 * page shows the same shape and the two must not disagree.
	 */
	const rows = $derived(flattenTree(categoryTree(data.categories)));

	/** Every category, as the parent picker offers it — indented so the tree reads in the list. */
	const parentOptions = $derived<ComboboxOption[]>([
		{ value: '', label: 'No parent (top level)' },
		...rows.map((node) => ({
			value: node.category.id,
			label: `${'  '.repeat(node.depth)}${node.category.name}`
		}))
	]);

	// The dialogs' state is declared before the deriveds that read it: a
	// `$derived` evaluates where it is written, so a `let` below it is still in
	// its temporal dead zone when the page first renders.
	let createOpen = $state(false);
	let editingId = $state<string | null>(null);
	let removingId = $state<string | null>(null);

	/**
	 * The same list with the category being edited and everything under it
	 * removed: a category cannot become its own ancestor, and keeping the
	 * choice off the picker is better than a trigger's refusal after the fact.
	 */
	const editParentOptions = $derived.by(() => {
		if (editingId === null) return parentOptions;
		const forbidden = subtreeIds(data.categories, editingId);
		return parentOptions.filter((option) => option.value === '' || !forbidden.has(option.value));
	});
	const removing = $derived(rows.find((node) => node.category.id === removingId) ?? null);

	const {
		form: createData,
		errors: createErrors,
		message: createMessage,
		constraints: createConstraints,
		submitting: creating,
		enhance: createEnhance
	} = superForm(data.createForm, {
		id: 'create-category',
		validators: zod4Client(createCategorySchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			createOpen = false;
			toast.success(`${terms.noun.charAt(0).toUpperCase() + terms.noun.slice(1)} created`);
			invalidate(QUERY.categories);
		}
	});

	const {
		form: editData,
		errors: editErrors,
		message: editMessage,
		constraints: editConstraints,
		submitting: saving,
		enhance: editEnhance
	} = superForm(data.updateForm, {
		id: 'update-category',
		validators: zod4Client(updateCategorySchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			editingId = null;
			toast.success('Category saved');
			invalidate(QUERY.categories);
		}
	});

	function startEditing(category: (typeof rows)[number]['category']) {
		$editData = {
			id: category.id,
			name: category.name,
			description: category.description ?? '',
			parent_id: category.parent_id ?? '',
			sort_order: String(category.sort_order)
		};
		editingId = category.id;
	}

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(data.removeForm, {
		id: 'delete-category',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingId = null;
			toast.success('Category deleted');
			invalidate(QUERY.categories);
		}
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canManage}
			<PageHeader.Actions>
				<Modal.Root bind:open={createOpen}>
					<Modal.Trigger>
						{#snippet child({ props })}
							<Button {...props}>
								<PlusIcon />
								Add {terms.noun}
							</Button>
						{/snippet}
					</Modal.Trigger>
					<Modal.Content>
						<form method="POST" action="?/create" use:createEnhance>
							<Modal.Card>
								<Modal.Header>
									<Modal.Title><Grid3x3Icon /> New {terms.noun}</Modal.Title>
									<Modal.Description>
										A {terms.noun} groups {productTerms.plural}; one inside another makes the tree
										your catalog is browsed by.
									</Modal.Description>
								</Modal.Header>
								<Modal.Body>
									<FormAlert message={$createMessage} class="mb-0" />
									<div class="grid gap-2">
										<Label for="create-category-name">Name</Label>
										<Input
											id="create-category-name"
											name="name"
											placeholder="Fixings"
											aria-invalid={$createErrors.name ? 'true' : undefined}
											bind:value={$createData.name}
											{...$createConstraints.name}
										/>
										{#if $createErrors.name}
											<p class="text-destructive text-sm">{$createErrors.name}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label for="create-category-parent">Sits under</Label>
										<Combobox
											id="create-category-parent"
											name="parent_id"
											options={parentOptions}
											bind:value={$createData.parent_id}
										/>
									</div>
									<div class="grid gap-2">
										<Label for="create-category-sort">Position</Label>
										<Input
											id="create-category-sort"
											name="sort_order"
											inputmode="numeric"
											placeholder="0 — where it sits among its siblings"
											aria-invalid={$createErrors.sort_order ? 'true' : undefined}
											bind:value={$createData.sort_order}
											{...$createConstraints.sort_order}
										/>
										{#if $createErrors.sort_order}
											<p class="text-destructive text-sm">{$createErrors.sort_order}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label for="create-category-description">Description</Label>
										<Textarea
											id="create-category-description"
											name="description"
											aria-invalid={$createErrors.description ? 'true' : undefined}
											bind:value={$createData.description}
											{...$createConstraints.description}
										/>
										{#if $createErrors.description}
											<p class="text-destructive text-sm">{$createErrors.description}</p>
										{/if}
									</div>
								</Modal.Body>
							</Modal.Card>
							<Modal.Footer>
								<Modal.Cancel>Cancel</Modal.Cancel>
								<Modal.Action type="submit" disabled={$creating}>
									{$creating ? 'Creating…' : `Create ${terms.noun}`}
								</Modal.Action>
							</Modal.Footer>
						</form>
					</Modal.Content>
				</Modal.Root>
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<!--
		A tree is not a table: the rows nest, so there is no column to sort and
		no filter to offer. That is why this is a card of rows rather than
		`DataTable` — the one screen in the app where that is the right answer.
	-->
	<Card.Root>
		<Card.Content class="p-0">
			{#if rows.length === 0}
				<Empty.Root class="py-12">
					<Empty.Media variant="icon"><Grid3x3Icon /></Empty.Media>
					<Empty.Title>No {terms.plural} yet</Empty.Title>
					<Empty.Description>
						{#if data.canManage}
							Group your {productTerms.plural} so a buyer can browse them.
						{:else}
							An owner or an admin manages the catalog tree.
						{/if}
					</Empty.Description>
				</Empty.Root>
			{:else}
				<ul class="divide-border divide-y">
					{#each rows as node (node.category.id)}
						<li class="flex items-center gap-3 px-4 py-3">
							<!-- Depth is drawn as indentation; the chevron marks a child. -->
							<span
								class="text-muted-foreground flex shrink-0 items-center"
								style="padding-inline-start: {node.depth * 1.25}rem"
							>
								{#if node.depth > 0}<ChevronRightIcon class="size-4" />{/if}
							</span>
							<a
								href="/categories/{node.category.id}"
								class="hover:underline focus-visible:underline"
							>
								{node.category.name}
							</a>
							<span class="text-muted-foreground ms-auto shrink-0 text-sm tabular-nums">
								{node.ownProducts}
								{node.ownProducts === 1 ? productTerms.noun : productTerms.plural}
								{#if node.totalProducts !== node.ownProducts}
									<span class="opacity-70">({node.totalProducts} with sub-{terms.plural})</span>
								{/if}
							</span>
							<RowActions
								name={node.category.name}
								canEdit={data.canManage}
								canDelete={data.canManage}
								onEdit={() => startEditing(node.category)}
								onDelete={() => (removingId = node.category.id)}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<!-- Edit — the row menu's first action. -->
<Modal.Root
	open={editingId !== null}
	onOpenChange={(open) => {
		if (!open) editingId = null;
	}}
>
	<Modal.Content>
		<form method="POST" action="?/update" use:editEnhance>
			<input type="hidden" name="id" value={$editData.id} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><Grid3x3Icon /> Edit {terms.noun}</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$editMessage} class="mb-0" />
					<div class="grid gap-2">
						<Label for="edit-category-name">Name</Label>
						<Input
							id="edit-category-name"
							name="name"
							aria-invalid={$editErrors.name ? 'true' : undefined}
							bind:value={$editData.name}
							{...$editConstraints.name}
						/>
						{#if $editErrors.name}
							<p class="text-destructive text-sm">{$editErrors.name}</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="edit-category-parent">Sits under</Label>
						<!-- The category and its own subtree are not offered: it cannot become its own ancestor. -->
						<Combobox
							id="edit-category-parent"
							name="parent_id"
							options={editParentOptions}
							bind:value={$editData.parent_id}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="edit-category-sort">Position</Label>
						<Input
							id="edit-category-sort"
							name="sort_order"
							inputmode="numeric"
							aria-invalid={$editErrors.sort_order ? 'true' : undefined}
							bind:value={$editData.sort_order}
							{...$editConstraints.sort_order}
						/>
						{#if $editErrors.sort_order}
							<p class="text-destructive text-sm">{$editErrors.sort_order}</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="edit-category-description">Description</Label>
						<Textarea
							id="edit-category-description"
							name="description"
							aria-invalid={$editErrors.description ? 'true' : undefined}
							bind:value={$editData.description}
							{...$editConstraints.description}
						/>
						{#if $editErrors.description}
							<p class="text-destructive text-sm">{$editErrors.description}</p>
						{/if}
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$saving}>
					{$saving ? 'Saving…' : 'Save changes'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Delete — the subtree goes with it, which the copy says before it asks. -->
<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Modal.Content>
		{#if removing}
			<form method="POST" action="?/remove" use:removeEnhance>
				<input type="hidden" name="id" value={removing.category.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Delete {removing.category.name}?</Modal.Title>
						<Modal.Description>
							{#if removing.children.length > 0}
								Everything under it goes too — {removing.children.length} sub-{removing.children
									.length === 1
									? terms.noun
									: terms.plural}.
							{/if}
							The {removing.totalProducts === 1 ? productTerms.noun : productTerms.plural} filed in it
							stay in the catalog, with no {terms.noun}.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" disabled={$deleting}>
						{$deleting ? 'Deleting…' : 'Delete'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
