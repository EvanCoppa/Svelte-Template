<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Builder from '$lib/components/proposal-builder/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { billableQuantity } from '$lib/crm/billables';
	import { estimateOptionTotal } from '$lib/crm/proposals';
	import { recordTerms } from '$lib/crm/records';
	import { term } from '$lib/features/vocabulary';
	import {
		MAX_OPTIONS,
		emptyOption,
		proposalBuilderSchema,
		type ProposalBuilderOption
	} from '$lib/schemas/proposal-builder';
	import { capitalize, cn } from '$lib/utils.js';

	/**
	 * The proposal builder — Yes Smile's treatment plan form, class for class,
	 * on the template's primitives: the person it is for and the two people on
	 * it, then "No. Plans" and the notes, then one fieldset per option, then
	 * the two blue save buttons. One nested document, posted as JSON to
	 * `?/create`. Every list the pickers draw from arrived with the load.
	 *
	 * The look is Yes Smile's on purpose — literal greys and blues rather than
	 * the theme's tokens — so those classes live in
	 * `$lib/components/proposal-builder/classes.ts` with their dark pairs, and
	 * nothing here re-spells them. Photos, insurance coverage and the cash
	 * offer toggle have no home in the model and are not here.
	 */
	let { data } = $props();

	// The words as the org's industry says them.
	const terms = $derived(recordTerms(page.data.terms, 'proposal'));
	const contactTerms = $derived(recordTerms(page.data.terms, 'contact'));
	const presenterLabel = $derived(term(page.data.vocabulary, 'proposal_presenter'));
	const responsibleLabel = $derived(term(page.data.vocabulary, 'proposal_responsible'));

	const { form, errors, message, submitting, enhance } = superForm(data.form, {
		// Options and lines are arrays: the document is posted, not the inputs.
		dataType: 'json',
		validators: zod4Client(proposalBuilderSchema),
		invalidateAll: false,
		// The first field in error scrolls into view, the way the source form did.
		scrollToError: { behavior: 'smooth', block: 'center' },
		onResult({ result }) {
			// Success is a redirect; the toast rides along.
			if (result.type === 'redirect') toast.success(`${capitalize(terms.noun)} created`);
		}
	});

	const contactOptions = $derived<ComboboxOption[]>(
		data.contacts.map((contact) => ({
			value: contact.id,
			label: contact.name,
			sublabel: [contact.email, contact.phone].filter(Boolean).join(' • ') || undefined
		}))
	);

	/** Picking a person fills their details in, the way the source form did. */
	function prefillContact(contactId: string) {
		const contact = data.contacts.find((entry) => entry.id === contactId);
		$form.contact_email = contact?.email ?? '';
		$form.contact_phone = contact?.phone ?? '';
	}

	/** "No. Plans": the count, kept between one and the ceiling; new options come in blank. */
	function resizeOptions(event: Event) {
		const wanted = Math.min(
			MAX_OPTIONS,
			Math.max(
				1,
				Number(event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : 1) || 1
			)
		);
		if (wanted < $form.options.length) {
			$form.options = $form.options.slice(0, wanted);
		} else {
			$form.options = [
				...$form.options,
				...Array.from({ length: wanted - $form.options.length }, (_, i) =>
					emptyOption(`Option ${String($form.options.length + i + 1)}`)
				)
			];
		}
	}

	// An estimate only — the database owns the stored figure.
	function estimateFor(option: ProposalBuilderOption): number {
		return estimateOptionTotal(
			{
				fee_override: option.fee_override,
				discount_pct: option.discount_pct,
				line_items: [
					...option.billables.map((line) => ({
						quantity: billableQuantity(line.detail, line.not_applicable),
						unit_cost: line.unit_cost
					})),
					...option.products
				]
			},
			{ default_fee: null, tax_rate: null }
		);
	}
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<Card.Root class="dark:bg-card m-2 mb-12 max-w-3xl rounded-lg bg-white shadow-md lg:mx-auto">
		<Card.Content>
			<form
				method="POST"
				action="?/create"
				class="flex flex-col gap-6"
				autocomplete="off"
				novalidate
				use:enhance
			>
				<FormAlert message={$message} />

				<!-- Who it is for, and who is responsible for it. -->
				<div class="flex flex-col gap-8 md:flex-row">
					<div data-field="contact_id" class="block md:w-1/2">
						<Label for="builder-contact" class={Builder.builderLabel}>
							{capitalize(contactTerms.noun)}:
						</Label>
						<Combobox
							id="builder-contact"
							options={contactOptions}
							bind:value={$form.contact_id}
							onchange={prefillContact}
							placeholder="Enter {contactTerms.noun} name"
							searchPlaceholder="Search {contactTerms.plural}…"
							emptyText="No {contactTerms.plural} yet"
							required
							invalid={Boolean($errors.contact_id)}
							class={cn(Builder.builderInput, $errors.contact_id && Builder.builderInputInvalid)}
						/>
						{#if $errors.contact_id}
							<p class={Builder.builderError}>{$errors.contact_id}</p>
						{/if}
					</div>

					<div class="block md:w-1/2">
						<Builder.PersonPicker
							id="builder-responsible"
							field="responsible_id"
							label={responsibleLabel}
							roster={data.roster}
							bind:value={$form.responsible_id}
							error={$errors.responsible_id}
						/>
					</div>
				</div>

				<div class="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
					<div class="block">
						<Label for="builder-email" class={Builder.builderLabel}>Email:</Label>
						<Input
							id="builder-email"
							type="email"
							placeholder="Enter email"
							autocomplete="off"
							disabled={!data.canEditContact}
							aria-invalid={$errors.contact_email ? 'true' : undefined}
							bind:value={$form.contact_email}
							class={Builder.builderInput}
						/>
						{#if $errors.contact_email}
							<p class={Builder.builderError}>{$errors.contact_email}</p>
						{/if}
					</div>
					<div class="block">
						<Label for="builder-phone" class={Builder.builderLabel}>Phone:</Label>
						<Input
							id="builder-phone"
							type="tel"
							placeholder="Enter phone (optional)"
							autocomplete="off"
							disabled={!data.canEditContact}
							bind:value={$form.contact_phone}
							class={Builder.builderInput}
						/>
					</div>
				</div>

				<!-- How many options, who presents, and the notes. -->
				<div class="flex flex-col gap-5">
					<div class="flex flex-col gap-4 md:flex-row md:items-end">
						<label class="dark:text-foreground block font-semibold text-gray-700">
							No. {capitalize(terms.plural)}:
							<Input
								type="number"
								min="1"
								max={MAX_OPTIONS}
								value={$form.options.length}
								oninput={resizeOptions}
								class="{Builder.builderInput} w-24"
							/>
						</label>
					</div>

					<Builder.PersonPicker
						id="builder-presenter"
						field="presenter_id"
						label={presenterLabel}
						roster={data.roster}
						bind:value={$form.presenter_id}
						error={$errors.presenter_id}
					/>

					<label class="dark:text-foreground block font-semibold text-gray-700">
						Notes:
						<Textarea
							placeholder="Enter notes"
							aria-invalid={$errors.notes ? 'true' : undefined}
							bind:value={$form.notes}
							class={Builder.builderInput}
						/>
						{#if $errors.notes}
							<p class={Builder.builderError}>{$errors.notes}</p>
						{/if}
					</label>
				</div>

				{#if $errors.options?._errors}
					<FormAlert message={$errors.options._errors.join(' ')} />
				{/if}

				<!-- The options. -->
				<div class="flex flex-col gap-6">
					{#each $form.options as option, i (i)}
						<Builder.Option
							index={i}
							bind:option={$form.options[i]}
							errors={$errors.options?.[i]}
							noun={terms.noun}
							billables={data.billables}
							quickPlans={data.quickPlans}
							products={data.products}
							estimate={estimateFor(option)}
						/>
					{/each}
				</div>

				<Builder.SaveBar
					submitting={$submitting}
					primaryLabel="Save {capitalize(terms.noun)} & open"
					secondaryLabel="Save & go to {terms.name}"
					onPrimary={() => ($form.redirect_to = 'record')}
					onSecondary={() => ($form.redirect_to = 'list')}
				/>
			</form>
		</Card.Content>
	</Card.Root>
</div>
