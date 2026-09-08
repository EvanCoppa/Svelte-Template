<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { dateProxy, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import StarIcon from '@lucide/svelte/icons/star';
	import XIcon from '@lucide/svelte/icons/x';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { TagBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox, type ComboboxGroup } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { capitalize } from '$lib/utils.js';
	import type { CatalogProduct, PartyOption } from './+page.server';
	import { MAX_OPTIONS, emptyLine, emptyOption, proposalBuilderSchema } from './schema';

	/**
	 * The proposal builder: who it is for, the terms every option shares, and
	 * the options themselves side by side — each a label, a price, a courtesy,
	 * financing, and the lines that make it up, picked from the catalog or
	 * typed in. Posted as one JSON form, so an option is never saved without
	 * its proposal.
	 */

	let { data } = $props();

	// The kind's words, as the org's industry says them: "quote", "treatment plan".
	const terms = $derived(recordTerms(page.data.terms, 'proposal'));

	const { form, errors, message, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(proposalBuilderSchema),
		dataType: 'json',
		onResult({ result }) {
			// Success is a redirect to the new record, so the toast is raised here
			// rather than in onUpdated, which never sees a redirect.
			if (result.type === 'redirect') toast.success(`${capitalize(terms.noun)} created`);
		}
	});

	const validUntil = dateProxy(form, 'valid_until', { format: 'datetime-local', empty: 'null' });

	// --- Who it is for -------------------------------------------------------

	/** A kind and an id in one picker value; the schema keeps them as two columns. */
	const PARTY_SEPARATOR = ':';

	function partyOptions(kind: string, rows: PartyOption[]) {
		return rows.map((row) => ({
			value: `${kind}${PARTY_SEPARATOR}${row.id}`,
			label: row.name,
			sublabel: row.detail ?? undefined
		}));
	}

	const partyGroups = $derived.by((): ComboboxGroup[] => {
		const groups: ComboboxGroup[] = [];
		const kinds = [
			['company', page.data.terms?.companies?.name, data.parties.companies],
			['contact', page.data.terms?.contacts?.name, data.parties.contacts],
			['deal', page.data.terms?.deals?.name, data.parties.deals]
		] as const;
		for (const [kind, name, rows] of kinds) {
			if (rows.length > 0)
				groups.push({ label: name ?? capitalize(`${kind}s`), options: partyOptions(kind, rows) });
		}
		return groups;
	});

	const partyValue = $derived(
		$form.entity_type && $form.entity_id
			? `${$form.entity_type}${PARTY_SEPARATOR}${$form.entity_id}`
			: ''
	);

	function pickParty(value: string) {
		const at = value.indexOf(PARTY_SEPARATOR);
		if (at === -1) {
			$form.entity_type = null;
			$form.entity_id = null;
			return;
		}
		const kind = value.slice(0, at);
		// The picker only ever offers these three kinds; anything else is unset.
		$form.entity_type = kind === 'company' || kind === 'contact' || kind === 'deal' ? kind : null;
		$form.entity_id = $form.entity_type ? value.slice(at + 1) : null;
	}

	// --- The options ---------------------------------------------------------

	function addOption() {
		if ($form.options.length >= MAX_OPTIONS) return;
		$form.options = [...$form.options, emptyOption($form.options.length + 1)];
	}

	function removeOption(index: number) {
		$form.options = $form.options.filter((_, i) => i !== index);
	}

	/** One recommended option at most: turning one on turns the others off. */
	function recommend(index: number, on: boolean) {
		$form.options = $form.options.map((option, i) => ({
			...option,
			is_recommended: i === index ? on : on ? false : option.is_recommended
		}));
	}

	// --- The lines -----------------------------------------------------------

	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	/** The catalog as the "Add from catalog" picker offers it, services first. */
	const catalogGroups = $derived.by((): ComboboxGroup[] => {
		const toOption = (product: CatalogProduct) => ({
			value: product.id,
			label: product.name,
			hint: money(product.unit_price, product.currency)
		});
		const services = data.products.filter((product) => product.kind === 'service');
		const goods = data.products.filter((product) => product.kind === 'good');
		const groups: ComboboxGroup[] = [];
		if (services.length > 0) groups.push({ label: 'Services', options: services.map(toOption) });
		if (goods.length > 0) groups.push({ label: 'Goods', options: goods.map(toOption) });
		return groups;
	});

	/**
	 * What each option's catalog picker currently shows. Cleared after every
	 * pick, so the picker reads "Add from catalog…" again rather than naming
	 * the last thing added.
	 */
	let catalogPicks = $state<string[]>([]);

	function addFromCatalog(index: number, productId: string) {
		catalogPicks[index] = '';
		const product = data.products.find((row) => row.id === productId);
		if (!product) return;
		// The line keeps its own label and price: repricing the catalog later
		// must never rewrite a proposal already sent (docs/proposals.md).
		$form.options[index].line_items = [
			...$form.options[index].line_items,
			{ product_id: product.id, label: product.name, quantity: 1, unit_cost: product.unit_price }
		];
	}

	function addCustomLine(index: number) {
		$form.options[index].line_items = [...$form.options[index].line_items, emptyLine()];
	}

	function removeLine(index: number, line: number) {
		$form.options[index].line_items = $form.options[index].line_items.filter((_, i) => i !== line);
	}

	/**
	 * What the lines add up to, as the writer types. The database computes the
	 * option's real total (fee, courtesy and tax included); this is only the
	 * sum of the rows on screen, so the builder never shows a figure it made up.
	 */
	function linesSubtotal(lines: { quantity: number | null; unit_cost: number | null }[]) {
		return lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.unit_cost ?? 0), 0);
	}

	function fieldError(error: string[] | undefined): string | undefined {
		return error?.[0];
	}
</script>

{#snippet inlineError(id: string, error: string | undefined)}
	{#if error}
		<p id="{id}-error" class="text-destructive text-sm">{error}</p>
	{/if}
{/snippet}

<div class="mx-auto max-w-5xl space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		<PageHeader.Actions>
			<Button href={recordListHref('proposal')} variant="outline">Cancel</Button>
			<!-- The form is long; its submit lives up here with the page's other actions. -->
			<Button type="submit" form="proposal-builder" disabled={$submitting}>
				{$submitting ? 'Creating…' : `Create ${terms.noun}`}
			</Button>
		</PageHeader.Actions>
	</PageHeader.Root>

	<FormAlert message={$message} />

	<form id="proposal-builder" method="POST" action="?/create" class="space-y-6" use:enhance>
		<Card.Root>
			<Card.Header>
				<Card.Title>Who it is for</Card.Title>
				<Card.Description>
					A {terms.noun} can hang off a record now, or be attached from its page later.
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-5 sm:grid-cols-2">
				<div class="grid gap-2 sm:col-span-2">
					<Label for="title" required>Title</Label>
					<Input
						id="title"
						name="title"
						placeholder="Crown and whitening — options"
						aria-invalid={$errors.title ? 'true' : undefined}
						aria-describedby={$errors.title ? 'title-error' : undefined}
						bind:value={$form.title}
					/>
					{@render inlineError('title', fieldError($errors.title))}
				</div>

				<div class="grid gap-2">
					<Label for="party">For</Label>
					<Combobox
						id="party"
						groups={partyGroups}
						value={partyValue}
						onchange={pickParty}
						placeholder="Not attached yet"
						searchPlaceholder="Search by name…"
						emptyText="No records to attach to"
						clearable
						invalid={Boolean($errors.entity_id)}
						disabled={partyGroups.length === 0}
					/>
					{@render inlineError('party', fieldError($errors.entity_id))}
				</div>

				<div class="grid gap-2">
					<Label for="valid-until">Valid until</Label>
					<Input
						id="valid-until"
						type="datetime-local"
						aria-invalid={$errors.valid_until ? 'true' : undefined}
						aria-describedby={$errors.valid_until ? 'valid-until-error' : undefined}
						bind:value={$validUntil}
					/>
					{@render inlineError('valid-until', fieldError($errors.valid_until))}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Terms</Card.Title>
				<Card.Description
					>Every option inherits these; the total is worked out from them.</Card.Description
				>
			</Card.Header>
			<Card.Content class="grid gap-5 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="default-fee">Fee</Label>
					<Input
						id="default-fee"
						type="number"
						min="0"
						step="0.01"
						placeholder="0.00"
						aria-invalid={$errors.default_fee ? 'true' : undefined}
						aria-describedby={$errors.default_fee ? 'default-fee-error' : undefined}
						bind:value={$form.default_fee}
					/>
					{@render inlineError('default-fee', fieldError($errors.default_fee))}
				</div>

				<div class="grid gap-2">
					<Label for="tax-rate">Tax rate (%)</Label>
					<Input
						id="tax-rate"
						type="number"
						min="0"
						max="100"
						step="0.01"
						placeholder="0"
						aria-invalid={$errors.tax_rate ? 'true' : undefined}
						aria-describedby={$errors.tax_rate ? 'tax-rate-error' : undefined}
						bind:value={$form.tax_rate}
					/>
					{@render inlineError('tax-rate', fieldError($errors.tax_rate))}
				</div>
			</Card.Content>
		</Card.Root>

		<div class="flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Options</h2>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={addOption}
				disabled={$form.options.length >= MAX_OPTIONS}
			>
				<PlusIcon />
				Add option
			</Button>
		</div>
		{@render inlineError('options', fieldError($errors.options?._errors))}

		<div class="grid items-start gap-6 lg:grid-cols-2">
			{#each $form.options as option, index (index)}
				{@const optionErrors = $errors.options?.[index]}
				{@const id = `option-${String(index)}`}
				<Card.Root class={option.is_recommended ? 'border-primary' : undefined}>
					<Card.Header>
						<div class="flex items-center gap-2">
							<Label for="{id}-label" class="sr-only">Option {index + 1} label</Label>
							<Input
								id="{id}-label"
								class="text-base font-semibold"
								placeholder="Option {index + 1}"
								aria-invalid={optionErrors?.label ? 'true' : undefined}
								aria-describedby={optionErrors?.label ? `${id}-label-error` : undefined}
								bind:value={$form.options[index].label}
							/>
							{#if $form.options.length > 1}
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Remove option {index + 1}"
									onclick={() => removeOption(index)}
								>
									<XIcon />
								</Button>
							{/if}
						</div>
						{@render inlineError(`${id}-label`, fieldError(optionErrors?.label))}
						<div class="flex items-center gap-2 pt-1">
							<Switch
								id="{id}-recommended"
								checked={option.is_recommended}
								onCheckedChange={(on) => recommend(index, on)}
							/>
							<Label for="{id}-recommended">Recommended</Label>
							{#if option.is_recommended}
								<TagBadge tone="violet"><StarIcon class="size-3" /> Recommended</TagBadge>
							{/if}
						</div>
					</Card.Header>

					<Card.Content class="space-y-5">
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="grid gap-2">
								<Label for="{id}-price">Price</Label>
								<Input
									id="{id}-price"
									type="number"
									min="0"
									step="0.01"
									placeholder="0.00"
									aria-invalid={optionErrors?.base_price ? 'true' : undefined}
									aria-describedby={optionErrors?.base_price ? `${id}-price-error` : undefined}
									bind:value={$form.options[index].base_price}
								/>
								{@render inlineError(`${id}-price`, fieldError(optionErrors?.base_price))}
							</div>
							<div class="grid gap-2">
								<Label for="{id}-courtesy">Courtesy (%)</Label>
								<Input
									id="{id}-courtesy"
									type="number"
									min="0"
									max="100"
									step="0.01"
									placeholder="0"
									aria-invalid={optionErrors?.discount_pct ? 'true' : undefined}
									aria-describedby={optionErrors?.discount_pct ? `${id}-courtesy-error` : undefined}
									bind:value={$form.options[index].discount_pct}
								/>
								{@render inlineError(`${id}-courtesy`, fieldError(optionErrors?.discount_pct))}
							</div>
						</div>

						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<Switch
									id="{id}-financing"
									bind:checked={$form.options[index].financing_available}
								/>
								<Label for="{id}-financing">Offer financing</Label>
							</div>
							{#if option.financing_available}
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="grid gap-2">
										<Label for="{id}-term" required>Term (months)</Label>
										<Input
											id="{id}-term"
											type="number"
											min="1"
											step="1"
											placeholder="12"
											aria-invalid={optionErrors?.financing_term_months ? 'true' : undefined}
											aria-describedby={optionErrors?.financing_term_months
												? `${id}-term-error`
												: undefined}
											bind:value={$form.options[index].financing_term_months}
										/>
										{@render inlineError(
											`${id}-term`,
											fieldError(optionErrors?.financing_term_months)
										)}
									</div>
									<div class="grid gap-2">
										<Label for="{id}-apr">APR (%)</Label>
										<Input
											id="{id}-apr"
											type="number"
											min="0"
											max="100"
											step="0.01"
											placeholder="0"
											aria-invalid={optionErrors?.financing_apr ? 'true' : undefined}
											aria-describedby={optionErrors?.financing_apr ? `${id}-apr-error` : undefined}
											bind:value={$form.options[index].financing_apr}
										/>
										{@render inlineError(`${id}-apr`, fieldError(optionErrors?.financing_apr))}
									</div>
								</div>
							{/if}
						</div>

						<div class="space-y-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<span class="text-sm font-medium">Lines</span>
								<div class="flex items-center gap-2">
									{#if catalogGroups.length > 0}
										<Combobox
											size="sm"
											class="w-48"
											groups={catalogGroups}
											bind:value={catalogPicks[index]}
											onchange={(productId) => addFromCatalog(index, productId)}
											placeholder="Add from catalog…"
											searchPlaceholder="Search the catalog…"
											ariaLabel="Add a line to option {index + 1} from the catalog"
										/>
									{/if}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => addCustomLine(index)}
									>
										<PlusIcon />
										Custom line
									</Button>
								</div>
							</div>

							{#each option.line_items, lineIndex (lineIndex)}
								{@const lineErrors = optionErrors?.line_items?.[lineIndex]}
								{@const lineId = `${id}-line-${String(lineIndex)}`}
								<div class="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem_auto] items-start gap-2">
									<div class="grid gap-1">
										<Label for="{lineId}-label" class="sr-only">Line {lineIndex + 1} label</Label>
										<Input
											id="{lineId}-label"
											placeholder="What this line is"
											aria-invalid={lineErrors?.label ? 'true' : undefined}
											aria-describedby={lineErrors?.label ? `${lineId}-label-error` : undefined}
											bind:value={$form.options[index].line_items[lineIndex].label}
										/>
										{@render inlineError(`${lineId}-label`, fieldError(lineErrors?.label))}
									</div>
									<div class="grid gap-1">
										<Label for="{lineId}-qty" class="sr-only">Line {lineIndex + 1} quantity</Label>
										<Input
											id="{lineId}-qty"
											type="number"
											min="0"
											step="1"
											placeholder="Qty"
											aria-invalid={lineErrors?.quantity ? 'true' : undefined}
											aria-describedby={lineErrors?.quantity ? `${lineId}-qty-error` : undefined}
											bind:value={$form.options[index].line_items[lineIndex].quantity}
										/>
										{@render inlineError(`${lineId}-qty`, fieldError(lineErrors?.quantity))}
									</div>
									<div class="grid gap-1">
										<Label for="{lineId}-cost" class="sr-only"
											>Line {lineIndex + 1} unit price</Label
										>
										<Input
											id="{lineId}-cost"
											type="number"
											min="0"
											step="0.01"
											placeholder="Each"
											aria-invalid={lineErrors?.unit_cost ? 'true' : undefined}
											aria-describedby={lineErrors?.unit_cost ? `${lineId}-cost-error` : undefined}
											bind:value={$form.options[index].line_items[lineIndex].unit_cost}
										/>
										{@render inlineError(`${lineId}-cost`, fieldError(lineErrors?.unit_cost))}
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Remove line {lineIndex + 1} from option {index + 1}"
										onclick={() => removeLine(index, lineIndex)}
									>
										<XIcon />
									</Button>
								</div>
							{:else}
								<p class="text-muted-foreground text-sm">
									No lines yet — priced by the price above alone.
								</p>
							{/each}

							{#if option.line_items.length > 0}
								<div class="text-muted-foreground flex items-center justify-between text-sm">
									<span>Lines subtotal</span>
									<span class="text-foreground font-medium tabular-nums">
										{money(linesSubtotal(option.line_items), 'USD')}
									</span>
								</div>
							{/if}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	</form>
</div>
