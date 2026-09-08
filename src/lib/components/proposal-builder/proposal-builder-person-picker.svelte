<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import type { BuilderMember } from '$lib/schemas/proposal-builder';
	import { cn } from '$lib/utils.js';
	import { builderError, builderInput, builderInputInvalid } from './classes.js';

	/**
	 * One of the two people on a proposal, picked from the roster — Yes
	 * Smile's presenter typeahead as a `Combobox`, with its "Selected:" line
	 * and its red Clear. The label is the industry's word for the role, and
	 * the page passes it in: the part knows nothing about which role it is.
	 */
	let {
		id,
		field,
		label,
		roster,
		value = $bindable(''),
		error
	}: {
		id: string;
		/** Names the wrapper for the first-error scroll. */
		field: string;
		/** The role as the industry says it: "Presenter", "Provider". */
		label: string;
		roster: readonly BuilderMember[];
		value?: string;
		/** superforms' messages for the field, as its `$errors` store gives them. */
		error?: readonly string[] | undefined;
	} = $props();

	const options = $derived<ComboboxOption[]>(
		roster.map((member) => ({
			value: member.userId,
			label: member.name,
			sublabel: member.email ?? undefined
		}))
	);
	const selected = $derived(roster.find((member) => member.userId === value) ?? null);
</script>

<div data-field={field} class="relative flex flex-col gap-2">
	<label for={id} class="dark:text-foreground font-semibold text-gray-700">{label}:</label>
	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<Combobox
				{id}
				{options}
				bind:value
				placeholder="Search for {label.toLowerCase()}..."
				searchPlaceholder="Search by name or email…"
				emptyText="Nobody on the team matches"
				invalid={Boolean(error)}
				class={cn(builderInput, error && builderInputInvalid)}
			/>
		</div>
		{#if selected}
			<Button
				variant="ghost"
				class="h-auto rounded px-2 py-1 text-sm text-red-500 hover:bg-transparent hover:text-red-700"
				onclick={() => (value = '')}
				aria-label="Clear {label.toLowerCase()} selection"
			>
				Clear
			</Button>
		{/if}
	</div>
	{#if selected}
		<div class="dark:text-muted-foreground text-sm text-gray-600">
			Selected: <span class="font-medium">{selected.name}</span>
		</div>
	{/if}
	{#if error}
		<p class={builderError}>{error.join(' ')}</p>
	{/if}
</div>
