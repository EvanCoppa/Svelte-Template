<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import type { ComboboxGroup, ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { motionCollapse, motionFlip, motionTransition } from '$lib/motion.js';
	import {
		billableLine,
		productLine,
		type BuilderBillable,
		type BuilderProduct,
		type BuilderQuickPlan,
		type ProposalBuilderBillableLine,
		type ProposalBuilderOption
	} from '$lib/schemas/proposal-builder';
	import { capitalize } from '$lib/utils.js';
	import { builderCaption, builderInput } from './classes.js';
	import Units from './proposal-builder-units.svelte';

	/**
	 * One option of the proposal — Yes Smile's "Treatment Plan N" fieldset.
	 * The page owns the option (it is a slice of the form document, bound in)
	 * and every list this picks from; this part only edits the slice.
	 */
	let {
		index,
		option = $bindable(),
		errors,
		noun,
		billables,
		quickPlans,
		products
	}: {
		index: number;
		option: ProposalBuilderOption;
		/** superforms' errors for this option, mirroring its shape. */
		errors: OptionErrors | undefined;
		/** What a proposal is called here — the legend says "Treatment plan 1". */
		noun: string;
		billables: readonly BuilderBillable[];
		quickPlans: readonly BuilderQuickPlan[];
		products: readonly BuilderProduct[];
	} = $props();

	type OptionErrors = {
		label?: string[];
		fee_override?: string[];
		discount_pct?: string[];
		billables?: Record<number, { detail?: string[] } | undefined>;
		products?: Record<number, { quantity?: string[] } | undefined>;
	};

	const CHIP = { duration: 0.22, ease: 'easeOut' } as const;
	const STILL = { duration: 0.15 } as const;

	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const byId = $derived(new Map(billables.map((billable) => [billable.id, billable])));
	/** The schedule's front line: shown as a checkbox on every option. */
	const featured = $derived(billables.filter((billable) => billable.is_featured));
	/** Lines that came in through the search box rather than a checkbox — the chips. */
	const searched = $derived(
		option.billables.filter((line) => !byId.get(line.billable_id)?.is_featured)
	);

	/** The whole schedule, as the search box offers it. */
	const searchOptions = $derived<ComboboxOption[]>(
		billables.map((billable) => ({
			value: billable.id,
			label: billable.name,
			sublabel: billable.code ?? undefined,
			hint: money(billable.unit_price, billable.currency)
		}))
	);

	/** The catalog, filed by category, priced on the right of each row. */
	const catalogGroups = $derived.by(() => {
		const groups: { label: string; options: ComboboxOption[] }[] = [];
		for (const product of products) {
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
				hint: money(product.unit_price, product.currency)
			});
		}
		return groups satisfies ComboboxGroup[];
	});

	// What the two pickers have selected: nothing, once a pick became a line.
	let billablePick = $state('');
	let productPick = $state('');

	/**
	 * Every edit replaces the option rather than mutating it: the page binds a
	 * slice of the form document, a plain object, and Svelte only carries a
	 * reassignment of a bound prop back up — a mutated member is lost.
	 */
	function set<K extends keyof ProposalBuilderOption>(key: K, value: ProposalBuilderOption[K]) {
		option = { ...option, [key]: value };
	}

	function setBillable(at: number, line: ProposalBuilderBillableLine) {
		set(
			'billables',
			option.billables.map((entry, index) => (index === at ? line : entry))
		);
	}

	function setProductQuantity(at: number, quantity: number) {
		set(
			'products',
			option.products.map((entry, index) => (index === at ? { ...entry, quantity } : entry))
		);
	}

	function has(billableId: string): boolean {
		return option.billables.some((line) => line.billable_id === billableId);
	}

	function addBillable(billableId: string) {
		const billable = byId.get(billableId);
		if (billable && !has(billableId))
			set('billables', [...option.billables, billableLine(billable)]);
		billablePick = '';
	}

	function removeBillable(billableId: string) {
		set(
			'billables',
			option.billables.filter((line) => line.billable_id !== billableId)
		);
	}

	function toggleBillable(billable: BuilderBillable) {
		if (has(billable.id)) removeBillable(billable.id);
		else set('billables', [...option.billables, billableLine(billable)]);
	}

	/**
	 * A quick plan replaces this option's billable lines with the bundle's and
	 * keeps its product lines — exactly Yes Smile's quick select. A bundled
	 * billable that has since been retired is skipped.
	 */
	function applyQuickPlan(plan: BuilderQuickPlan) {
		set(
			'billables',
			plan.billable_ids.flatMap((id) => {
				const billable = byId.get(id);
				return billable ? [billableLine(billable)] : [];
			})
		);
	}

	function addProduct(productId: string) {
		const product = products.find((entry) => entry.id === productId);
		if (product && !option.products.some((line) => line.product_id === productId)) {
			set('products', [...option.products, productLine(product)]);
		}
		productPick = '';
	}

	function removeProduct(productId: string) {
		set(
			'products',
			option.products.filter((line) => line.product_id !== productId)
		);
	}
</script>

<fieldset
	data-slot="proposal-builder-option"
	class="dark:border-input space-y-4 rounded-md border border-gray-300 p-4"
	in:motionTransition={{
		keyframes: { opacity: [0.2, 1], y: [30, 0] },
		transition: { duration: 0.35, ease: 'easeOut' },
		reduced: { keyframes: { opacity: [0.2, 1] }, transition: STILL }
	}}
>
	<legend class="mb-0 font-bold text-blue-700 dark:text-blue-400">
		{capitalize(noun)}
		{index + 1}
	</legend>

	<div class="flex flex-col gap-4 sm:flex-row">
		<label class="dark:text-foreground block flex-1 font-semibold text-gray-700">
			Plan Name:
			<Input
				placeholder="Option {index + 1}"
				autocomplete="off"
				aria-invalid={errors?.label ? 'true' : undefined}
				bind:value={() => option.label, (value) => set('label', value)}
				class={builderInput}
			/>
			{#if errors?.label}
				<p class="mt-1 text-sm font-normal text-red-500">{errors.label}</p>
			{/if}
		</label>

		<label class="dark:text-foreground block font-semibold text-gray-700">
			Case Fee:
			<Input
				type="number"
				min="0"
				step="0.01"
				placeholder="Enter case fee"
				autocomplete="off"
				aria-invalid={errors?.fee_override ? 'true' : undefined}
				bind:value={() => option.fee_override, (value) => set('fee_override', value)}
				class="{builderInput} sm:w-32"
			/>
			{#if errors?.fee_override}
				<p class="mt-1 text-sm font-normal text-red-500">{errors.fee_override}</p>
			{/if}
		</label>

		<label class="dark:text-foreground block font-semibold text-gray-700">
			Courtesy Amount %:
			<Input
				type="number"
				min="0"
				max="100"
				step="0.01"
				placeholder="Enter courtesy %"
				autocomplete="off"
				aria-invalid={errors?.discount_pct ? 'true' : undefined}
				bind:value={() => option.discount_pct, (value) => set('discount_pct', value)}
				class="{builderInput} sm:w-32"
			/>
			{#if errors?.discount_pct}
				<p class="mt-1 text-sm font-normal text-red-500">{errors.discount_pct}</p>
			{/if}
		</label>
	</div>

	<div class="flex flex-wrap items-center gap-6">
		<label class="dark:text-foreground inline-flex items-center gap-2 font-semibold text-gray-700">
			<span>Show Financing:</span>
			<Switch
				class="h-6 w-11 data-[state=checked]:bg-blue-600 [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-6 [&_[data-slot=switch-thumb]]:data-[state=unchecked]:translate-x-1"
				bind:checked={() => option.financing_available, (on) => set('financing_available', on)}
			/>
		</label>
		<label class="dark:text-foreground inline-flex items-center gap-2 font-semibold text-gray-700">
			<span>Recommended:</span>
			<Switch
				class="h-6 w-11 data-[state=checked]:bg-blue-600 [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-6 [&_[data-slot=switch-thumb]]:data-[state=unchecked]:translate-x-1"
				bind:checked={() => option.is_recommended, (on) => set('is_recommended', on)}
			/>
		</label>
	</div>

	{#if quickPlans.length > 0}
		<div class="flex flex-col gap-2">
			<span class="{builderCaption} pb-2">Quick Select:</span>
			<div class="flex flex-wrap items-center gap-2">
				{#each quickPlans as plan (plan.id)}
					<Button
						variant="ghost"
						class="h-auto rounded bg-blue-100 px-3 py-1 font-semibold text-blue-700 transition hover:bg-blue-200 hover:text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
						onclick={() => applyQuickPlan(plan)}
					>
						{plan.name}
					</Button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="relative flex flex-col gap-2">
		<label for="option-{index}-search" class={builderCaption}>Add by Code or Name:</label>
		<div class="flex flex-col items-start gap-2">
			<Combobox
				id="option-{index}-search"
				options={searchOptions}
				bind:value={billablePick}
				onchange={addBillable}
				placeholder="Search code or name"
				searchPlaceholder="Search code or name"
				emptyText="Nothing on the schedule matches"
				searchThreshold={1}
				class="w-full max-w-[500px] {builderInput} mt-0 px-2 py-1"
				contentClass="w-[500px] max-w-[calc(100vw-2rem)]"
			/>
			<div class="flex flex-wrap gap-1">
				{#each searched as line (line.billable_id)}
					{@const billable = byId.get(line.billable_id)}
					<span
						class="dark:bg-muted flex items-center rounded-sm bg-gray-100 px-2 py-0.5 text-sm"
						animate:motionFlip={{ transition: CHIP }}
						in:motionTransition={{
							keyframes: { scale: [0.85, 1], opacity: [0, 1] },
							transition: CHIP,
							reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
						}}
						out:motionTransition={{
							keyframes: { scale: 0.85, opacity: 0 },
							transition: CHIP,
							reduced: { keyframes: { opacity: 0 }, transition: STILL }
						}}
					>
						{billable?.code ?? line.label}
						<Button
							variant="ghost"
							class="ml-1 h-auto p-0 text-blue-500 hover:bg-transparent hover:text-blue-700"
							onclick={() => removeBillable(line.billable_id)}
							aria-label="Remove {line.label}"
						>
							×
						</Button>
					</span>
				{/each}
			</div>
		</div>
	</div>

	{#if featured.length > 0}
		<div class="flex flex-wrap gap-4">
			<span class="{builderCaption} w-full">Items:</span>
			{#each featured as billable (billable.id)}
				<Label
					for="option-{index}-item-{billable.id}"
					class="inline-flex items-center gap-2 text-base leading-normal font-normal"
				>
					<Checkbox
						id="option-{index}-item-{billable.id}"
						class="size-5 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
						checked={has(billable.id)}
						onCheckedChange={() => toggleBillable(billable)}
					/>
					<span>{billable.name}</span>
				</Label>
			{/each}
		</div>
	{/if}

	<!-- The units for every billable on the option; products have no units. -->
	<div class="mt-6 flex flex-col gap-2">
		{#each option.billables as line, j (line.billable_id)}
			<div
				transition:motionCollapse={{ transition: CHIP }}
				animate:motionFlip={{ transition: CHIP }}
			>
				<Units
					id="option-{index}-units-{line.billable_id}"
					{line}
					billable={byId.get(line.billable_id)}
					onchange={(next) => setBillable(j, next)}
				/>
				{#if errors?.billables?.[j]?.detail}
					<p class="mt-1 text-sm font-normal text-red-500">{errors.billables[j]?.detail}</p>
				{/if}
			</div>
		{/each}
	</div>

	{#if products.length > 0}
		<div class="dark:border-border mt-6 flex flex-col gap-2 border-t border-gray-200 pt-4">
			<div class="flex items-center justify-between gap-3">
				<span class={builderCaption}>Products</span>
				<Combobox
					groups={catalogGroups}
					bind:value={productPick}
					onchange={addProduct}
					placeholder="+ Add a product…"
					searchPlaceholder="Search the catalog…"
					ariaLabel="Add a product to option {index + 1}"
					size="sm"
					class="w-56"
					contentClass="w-80"
				/>
			</div>

			{#if option.products.length > 0}
				<div class="mt-1 flex flex-col gap-2">
					{#each option.products as line, k (line.product_id)}
						<div
							class="dark:border-border dark:bg-muted/40 flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
						>
							<span class="dark:text-foreground flex-1 text-gray-800">{line.label}</span>
							<span class="dark:text-muted-foreground text-sm text-gray-500">
								{usd.format(line.unit_cost)} each
							</span>
							<label
								class="dark:text-muted-foreground flex items-center gap-1 text-sm text-gray-600"
							>
								Qty:
								<Input
									type="number"
									min="1"
									step="1"
									aria-invalid={errors?.products?.[k]?.quantity ? 'true' : undefined}
									bind:value={() => line.quantity, (quantity) => setProductQuantity(k, quantity)}
									class="dark:border-input mt-0 h-auto w-16 border-gray-300 px-2 py-1 focus-visible:border-blue-500/70 focus-visible:ring-[1.5px] focus-visible:ring-blue-500/65"
								/>
							</label>
							<Button
								variant="ghost"
								class="h-auto text-sm font-medium text-red-600 hover:bg-transparent hover:text-red-800"
								onclick={() => removeProduct(line.product_id)}
								aria-label="Remove {line.label}"
							>
								Remove
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</fieldset>
