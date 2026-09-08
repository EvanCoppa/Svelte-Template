<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { dateProxy, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import type { ComboboxGroup, ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { estimateOptionTotal } from '$lib/crm/proposals';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { capitalize } from '$lib/utils.js';
	import {
		MAX_OPTIONS,
		emptyLineItem,
		emptyOption,
		parentValue,
		proposalBuilderSchema
	} from './schema';

	/**
	 * The proposal builder. One nested document — the proposal, the record it
	 * is for, and its options with their lines — edited in place and posted as
	 * JSON to `?/create`, which lands on the new record's page. Every list the
	 * pickers draw from arrived with the load; nothing here fetches.
	 */
	let { data } = $props();

	// What a proposal is called here — "quote", "treatment plan".
	const terms = $derived(recordTerms(page.data.terms, 'proposal'));

	const { form, errors, message, constraints, submitting, enhance } = superForm(data.form, {
		// Options and lines are arrays: the document is posted, not the inputs.
		dataType: 'json',
		validators: zod4Client(proposalBuilderSchema),
		invalidateAll: false,
		onResult({ result }) {
			// Success is a redirect to the new record; the toast rides along.
			if (result.type === 'redirect') toast.success(`${capitalize(terms.noun)} created`);
		}
	});

	// A datetime-local input speaks wall-clock strings; the form holds an instant.
	const validUntil = dateProxy(form, 'valid_until', { format: 'datetime-local', empty: 'null' });

	// The record the proposal is for: every kind the reader may open, in one
	// list, each group named as the org's industry names the kind.
	const parentGroups = $derived<ComboboxGroup[]>(
		data.parents.map((group) => ({
			label: group.name,
			options: group.records.map((record) => ({
				value: parentValue({ entity_type: group.kind, entity_id: record.id }),
				label: record.name,
				sublabel: record.detail ?? undefined
			}))
		}))
	);

	// A product carries its own currency; format each in its own.
	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	// The catalog, filed by category, priced on the right of each row.
	const catalogGroups = $derived.by(() => {
		const groups: { label: string; options: ComboboxOption[] }[] = [];
		for (const product of data.catalog) {
			const label = product.category ?? 'Uncategorised';
			let group = groups.find((candidate) => candidate.label === label);
			if (!group) {
				group = { label, options: [] };
				groups.push(group);
			}
			group.options.push({
				value: product.id,
				label: product.name,
				sublabel: product.sku ?? undefined,
				hint: `${money(product.unit_price, product.currency)}${product.unit ? ` / ${product.unit}` : ''}`
			});
		}
		return groups;
	});

	// What every option's catalog picker has selected — nothing, once the pick
	// has become a line. Bound so the trigger resets after each add.
	let catalogPick = $state('');

	function addOption() {
		if ($form.options.length >= MAX_OPTIONS) return;
		$form.options = [...$form.options, emptyOption(`Option ${String($form.options.length + 1)}`)];
	}

	function removeOption(index: number) {
		if ($form.options.length <= 1) return;
		$form.options = $form.options.filter((_, i) => i !== index);
	}

	function addLine(index: number, line = emptyLineItem()) {
		$form.options[index].line_items = [...$form.options[index].line_items, line];
	}

	/** A catalog pick becomes a line that snapshots the price: repricing later never rewrites it. */
	function addCatalogLine(index: number, productId: string) {
		const product = data.catalog.find((entry) => entry.id === productId);
		if (product) {
			addLine(index, {
				product_id: product.id,
				label: product.name,
				quantity: 1,
				unit_cost: product.unit_price
			});
		}
		catalogPick = '';
	}

	function removeLine(index: number, position: number) {
		$form.options[index].line_items = $form.options[index].line_items.filter(
			(_, j) => j !== position
		);
	}

	/** At most one option is recommended: ticking one unticks the rest. */
	function recommend(index: number, checked: boolean) {
		$form.options = $form.options.map((option, i) => ({
			...option,
			is_recommended: i === index ? checked : checked ? false : option.is_recommended
		}));
	}

	// Estimates only — the database owns the stored figure.
	const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const estimates = $derived(
		$form.options.map((option) =>
			estimateOptionTotal(option, { default_fee: $form.default_fee, tax_rate: $form.tax_rate })
		)
	);
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<form method="POST" action="?/create" class="space-y-6" use:enhance>
		<FormAlert message={$message} />

		<Card.Root>
			<Card.Header>
				<Card.Title>Details</Card.Title>
				<Card.Description>
					Who the {terms.noun} is for and the terms every option shares.
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-5 sm:grid-cols-2">
				<div class="grid gap-2 sm:col-span-2">
					<Label for="proposal-title" required>Title</Label>
					<Input
						id="proposal-title"
						placeholder="Crown and whitening"
						aria-invalid={$errors.title ? 'true' : undefined}
						aria-describedby={$errors.title ? 'proposal-title-error' : undefined}
						bind:value={$form.title}
						{...$constraints.title}
					/>
					{#if $errors.title}
						<p id="proposal-title-error" class="text-destructive text-sm">{$errors.title}</p>
					{/if}
				</div>

				<div class="grid gap-2">
					<Label for="proposal-parent">For</Label>
					<Combobox
						id="proposal-parent"
						groups={parentGroups}
						bind:value={$form.parent}
						placeholder="Unattached draft"
						searchPlaceholder="Search by name…"
						emptyText="Nothing to attach it to yet"
						clearable
						invalid={Boolean($errors.parent)}
					/>
					{#if $errors.parent}
						<p class="text-destructive text-sm">{$errors.parent}</p>
					{/if}
				</div>

				<div class="grid gap-2">
					<Label for="proposal-valid-until">Valid until</Label>
					<Input
						id="proposal-valid-until"
						type="datetime-local"
						aria-invalid={$errors.valid_until ? 'true' : undefined}
						bind:value={$validUntil}
					/>
					{#if $errors.valid_until}
						<p class="text-destructive text-sm">{$errors.valid_until}</p>
					{/if}
				</div>

				<div class="grid gap-2">
					<Label for="proposal-default-fee">Default fee</Label>
					<Input
						id="proposal-default-fee"
						type="number"
						min="0"
						step="0.01"
						placeholder="0.00"
						aria-invalid={$errors.default_fee ? 'true' : undefined}
						bind:value={$form.default_fee}
					/>
					{#if $errors.default_fee}
						<p class="text-destructive text-sm">{$errors.default_fee}</p>
					{/if}
				</div>

				<div class="grid gap-2">
					<Label for="proposal-tax-rate">Tax rate %</Label>
					<Input
						id="proposal-tax-rate"
						type="number"
						min="0"
						max="100"
						step="0.01"
						placeholder="0"
						aria-invalid={$errors.tax_rate ? 'true' : undefined}
						bind:value={$form.tax_rate}
					/>
					{#if $errors.tax_rate}
						<p class="text-destructive text-sm">{$errors.tax_rate}</p>
					{/if}
				</div>

				<div class="grid gap-2 sm:col-span-2">
					<Label for="proposal-notes">Notes</Label>
					<Textarea
						id="proposal-notes"
						placeholder="Anything worth remembering about this {terms.noun}"
						aria-invalid={$errors.notes ? 'true' : undefined}
						bind:value={$form.notes}
						{...$constraints.notes}
					/>
					{#if $errors.notes}
						<p class="text-destructive text-sm">{$errors.notes}</p>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		{#if $errors.options?._errors}
			<FormAlert message={$errors.options._errors.join(' ')} />
		{/if}

		{#each $form.options, i (i)}
			{@const optionErrors = $errors.options?.[i]}
			<Card.Root>
				<Card.Header>
					<Card.Title>Option {i + 1}</Card.Title>
					<Card.Description>
						Estimated {usd.format(estimates[i] ?? 0)} — the stored total is computed on save.
					</Card.Description>
					{#if $form.options.length > 1}
						<Card.Action>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Remove option {i + 1}"
								onclick={() => removeOption(i)}
							>
								<Trash2Icon />
							</Button>
						</Card.Action>
					{/if}
				</Card.Header>
				<Card.Content class="space-y-5">
					<div class="grid gap-5 sm:grid-cols-3">
						<div class="grid gap-2">
							<Label for="option-{i}-label" required>Label</Label>
							<Input
								id="option-{i}-label"
								placeholder="Option {i + 1}"
								aria-invalid={optionErrors?.label ? 'true' : undefined}
								bind:value={$form.options[i].label}
								{...$constraints.options?.label}
							/>
							{#if optionErrors?.label}
								<p class="text-destructive text-sm">{optionErrors.label}</p>
							{/if}
						</div>

						<div class="grid gap-2">
							<Label for="option-{i}-fee">Fee</Label>
							<Input
								id="option-{i}-fee"
								type="number"
								min="0"
								step="0.01"
								placeholder="Inherits the default fee"
								aria-invalid={optionErrors?.fee_override ? 'true' : undefined}
								bind:value={$form.options[i].fee_override}
							/>
							{#if optionErrors?.fee_override}
								<p class="text-destructive text-sm">{optionErrors.fee_override}</p>
							{/if}
						</div>

						<div class="grid gap-2">
							<Label for="option-{i}-discount">Discount %</Label>
							<Input
								id="option-{i}-discount"
								type="number"
								min="0"
								max="100"
								step="0.01"
								placeholder="0"
								aria-invalid={optionErrors?.discount_pct ? 'true' : undefined}
								bind:value={$form.options[i].discount_pct}
							/>
							{#if optionErrors?.discount_pct}
								<p class="text-destructive text-sm">{optionErrors.discount_pct}</p>
							{/if}
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-6">
						<Label for="option-{i}-recommended">
							<Checkbox
								id="option-{i}-recommended"
								checked={$form.options[i].is_recommended}
								onCheckedChange={(checked) => recommend(i, checked === true)}
							/>
							Recommended
						</Label>
						<Label for="option-{i}-financing">
							<Switch
								id="option-{i}-financing"
								bind:checked={$form.options[i].financing_available}
							/>
							Financing available
						</Label>
					</div>

					<div class="space-y-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="text-sm font-medium">Lines</span>
							<div class="flex items-center gap-2">
								<Combobox
									groups={catalogGroups}
									bind:value={catalogPick}
									onchange={(productId) => addCatalogLine(i, productId)}
									placeholder="Add from the catalog…"
									searchPlaceholder="Search the catalog…"
									emptyText="No active products in the catalog"
									ariaLabel="Add a catalog line to option {i + 1}"
									size="sm"
									class="w-64"
									contentClass="w-96"
								/>
								<Button variant="outline" size="sm" onclick={() => addLine(i)}>
									<PlusIcon />
									Custom line
								</Button>
							</div>
						</div>

						{#each $form.options[i].line_items, j (j)}
							{@const lineErrors = optionErrors?.line_items?.[j]}
							<div class="grid grid-cols-[minmax(0,1fr)_5rem_7rem_auto] items-start gap-2">
								<div class="grid gap-1">
									<Input
										aria-label="Line {j + 1} label"
										placeholder="What the line is for"
										aria-invalid={lineErrors?.label ? 'true' : undefined}
										bind:value={$form.options[i].line_items[j].label}
									/>
									{#if lineErrors?.label}
										<p class="text-destructive text-sm">{lineErrors.label}</p>
									{/if}
								</div>
								<div class="grid gap-1">
									<Input
										type="number"
										min="0"
										step="1"
										aria-label="Line {j + 1} quantity"
										aria-invalid={lineErrors?.quantity ? 'true' : undefined}
										bind:value={$form.options[i].line_items[j].quantity}
									/>
									{#if lineErrors?.quantity}
										<p class="text-destructive text-sm">{lineErrors.quantity}</p>
									{/if}
								</div>
								<div class="grid gap-1">
									<Input
										type="number"
										min="0"
										step="0.01"
										aria-label="Line {j + 1} unit cost"
										aria-invalid={lineErrors?.unit_cost ? 'true' : undefined}
										bind:value={$form.options[i].line_items[j].unit_cost}
									/>
									{#if lineErrors?.unit_cost}
										<p class="text-destructive text-sm">{lineErrors.unit_cost}</p>
									{/if}
								</div>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Remove line {j + 1} from option {i + 1}"
									onclick={() => removeLine(i, j)}
								>
									<XIcon />
								</Button>
							</div>
						{:else}
							<p class="text-muted-foreground text-sm">
								No lines yet. Pick from the catalog, or add a custom line.
							</p>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>
		{/each}

		<div class="flex flex-wrap items-center justify-between gap-3">
			<Button variant="outline" onclick={addOption} disabled={$form.options.length >= MAX_OPTIONS}>
				<PlusIcon />
				Add option
			</Button>
			<div class="flex items-center gap-2">
				<Button variant="ghost" href={recordListHref('proposal')}>Cancel</Button>
				<Button type="submit" disabled={$submitting}>
					{$submitting ? 'Creating…' : `Create ${terms.noun}`}
				</Button>
			</div>
		</div>
	</form>
</div>
