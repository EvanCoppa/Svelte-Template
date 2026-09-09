<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { unitTokens } from '$lib/crm/billables';
	import type { BuilderBillable, ProposalBuilderBillableLine } from '$lib/schemas/proposal-builder';
	import { capitalize } from '$lib/utils.js';
	import { builderInput } from './classes.js';

	/**
	 * The units a billable line is counted in — Yes Smile's teeth / quadrant /
	 * arch input, generalised: a billable that declares `unit_choices` offers
	 * them as chips, one that does not takes the units typed in ("12, 13",
	 * "1-3"), and N/A says no units make sense for this line. Quantity is the
	 * number of units either way (`$lib/crm/billables`).
	 *
	 * The line is the option's to hold: every edit hands a replacement back
	 * through `onchange`, never a mutation (a bound slice of the form document
	 * is a plain object, and Svelte carries only a reassignment up).
	 */
	let {
		id,
		line,
		billable,
		onchange
	}: {
		id: string;
		line: ProposalBuilderBillableLine;
		billable: BuilderBillable | undefined;
		onchange: (line: ProposalBuilderBillableLine) => void;
	} = $props();

	const choices = $derived(billable?.unit_choices ?? null);
	const label = $derived(`${capitalize(billable?.unit ?? 'units')} for ${line.label}:`);
	const picked = $derived(unitTokens(line.detail));

	function toggleChoice(choice: string) {
		const next = picked.includes(choice)
			? picked.filter((token) => token !== choice)
			: [...picked, choice];
		// The order the chips are drawn in, not the order they were clicked.
		onchange({
			...line,
			detail: (choices ?? []).filter((token) => next.includes(token)).join(', ')
		});
	}

	function toggleNotApplicable() {
		const notApplicable = !line.not_applicable;
		onchange({ ...line, not_applicable: notApplicable, detail: notApplicable ? '' : line.detail });
	}
</script>

<div class="flex flex-col gap-2">
	<label for={id} class="dark:text-foreground flex gap-4 font-semibold text-gray-700">{label}</label
	>
	<div class="flex">
		{#if !line.not_applicable}
			{#if choices}
				<div class="flex gap-2" role="group" aria-label={label}>
					{#each choices as choice (choice)}
						{@const on = picked.includes(choice)}
						<Button
							variant="ghost"
							aria-pressed={on}
							class="h-auto rounded border px-3 py-2 transition {on
								? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:text-white'
								: 'dark:border-input dark:bg-card dark:text-foreground dark:hover:bg-muted border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}"
							onclick={() => toggleChoice(choice)}
						>
							{choice}
						</Button>
					{/each}
				</div>
			{:else}
				<Input
					{id}
					placeholder="e.g. 12, 13"
					autocomplete="off"
					bind:value={() => line.detail, (detail) => onchange({ ...line, detail })}
					class="mt-0 {builderInput}"
				/>
			{/if}
		{/if}
		<Button
			variant="ghost"
			aria-pressed={line.not_applicable}
			class="dark:text-foreground dark:hover:bg-muted ml-2 h-auto rounded px-3 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-300 {line.not_applicable
				? 'dark:bg-muted-foreground/40 bg-gray-400'
				: 'dark:bg-muted bg-gray-200'}"
			onclick={toggleNotApplicable}
		>
			N/A
		</Button>
	</div>
</div>
