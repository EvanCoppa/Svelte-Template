<script lang="ts">
	import { page } from '$app/state';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import PackageIcon from '@lucide/svelte/icons/package';
	import ShareIcon from '@lucide/svelte/icons/share-2';
	import ShoppingCartIcon from '@lucide/svelte/icons/shopping-cart';
	import TrendingDownIcon from '@lucide/svelte/icons/trending-down';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import TruckIcon from '@lucide/svelte/icons/truck';
	import * as Detail from '$lib/components/detail/index.js';
	import EditRecord from '$lib/components/edit-record.svelte';
	import { CopyButton, ProgressBar } from '$lib/components/enhanced/index.js';
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { allocatedQuantity, salesSummary } from '$lib/crm/products';
	import { recordHref, recordListHref, recordTerms } from '$lib/crm/records';
	import { LINE_FULFILLMENT_TONE, ORDER_STATUS_TONE, PURCHASE_STATUS_TONE } from '$lib/crm/tones';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';
	import { noteCommands } from '$lib/notes-api';
	import { QUERY } from '$lib/queries';
	import { capitalize } from '$lib/utils.js';
	import ProductMedia from './product-media.svelte';
	import SalesSparkline from './sales-sparkline.svelte';

	let { data } = $props();

	// What the industry calls a product — "Part" on a roof, "Item" at a shop.
	const terms = $derived(recordTerms(page.data.terms, 'product'));
	const orderTerms = $derived(recordTerms(page.data.terms, 'order'));
	const purchaseTerms = $derived(recordTerms(page.data.terms, 'purchase'));

	const facts = $derived(data.record.fields.filter((field) => field.value.type === 'link'));
	const details = $derived(data.record.fields.filter((field) => field.value.type !== 'link'));

	// Fixed locale, like every date on a page — see the staff page.
	const mediumDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
	const quantity = new Intl.NumberFormat('en-US');
	const money = $derived(
		new Intl.NumberFormat('en-US', { style: 'currency', currency: data.product.currency })
	);
	const percent = new Intl.NumberFormat('en-US', {
		style: 'percent',
		maximumFractionDigits: 1,
		signDisplay: 'exceptZero'
	});

	/** Who last touched it, when — the header's second line. */
	const updatedBy = $derived(
		data.record.createdBy ? data.people.get(data.record.createdBy) : undefined
	);

	/** The note the button just made, so the caret lands in it. */
	let addedNoteId = $state<string | null>(null);

	async function addNote() {
		const note = await noteCommands.create({ entityType: 'product', entityId: data.record.id });
		if (note) addedNoteId = note.id;
	}

	let tab = $state('overview');

	const RECENT = 3;
	const recentActivities = $derived(data.activities.slice(0, RECENT));

	const queryKey = $derived(QUERY.record('product', data.record.id));

	let salesOpen = $state(true);
	let stockOpen = $state(true);
	let detailsOpen = $state(true);
	let notesOpen = $state(true);

	const canManageImage = $derived(data.edit?.canEdit ?? false);

	/**
	 * How it sells, folded in the reader's own clock: "last 30 days" is a
	 * wall-clock phrase, the ledger's "overdue" rule. Null when this session
	 * may not open orders — then there is no figure, not a zero.
	 */
	const sales = $derived(data.orderLines ? salesSummary(data.orderLines, new Date()) : null);

	/** What is on the shelf against what confirmed orders have not taken yet. */
	const stock = $derived.by(() => {
		if (!data.product.trackInventory) return null;
		const onHand = data.product.quantityOnHand ?? 0;
		const allocated = data.orderLines ? allocatedQuantity(data.orderLines) : null;
		return {
			onHand,
			allocated,
			available: allocated === null ? onHand : onHand - allocated
		};
	});

	/** The gap between what it costs and what it sells for, when both are known. */
	const margin = $derived.by(() => {
		const { unitPrice, unitCost } = data.product;
		if (unitCost === null || unitPrice <= 0) return null;
		return (unitPrice - unitCost) / unitPrice;
	});
</script>

<div class="space-y-6">
	<!-- The record: the way back, then the picture, the name, and where it stands. -->
	<Detail.Header>
		<Detail.Back href={recordListHref('product')} label="All {terms.plural}" />
		<Detail.Identity
			id={data.record.id}
			name={data.record.name}
			image={data.product.imageUrl}
			pills={data.record.pills}
			tags={data.tags}
		>
			<p class="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-sm">
				{#if data.product.sku}
					<span>SKU <span class="text-foreground font-medium">{data.product.sku}</span></span>
					<span aria-hidden="true">·</span>
				{/if}
				<span>Created {mediumDate.format(new Date(data.record.createdAt))}</span>
				<span aria-hidden="true">·</span>
				<span>
					Updated {mediumDate.format(new Date(data.record.updatedAt))}{#if updatedBy}
						by {updatedBy}{/if}
				</span>
			</p>
			{#if facts.length > 0}
				<Detail.Facts>
					{#each facts as field (field.label)}
						{#if field.value.type === 'link'}
							<Detail.Fact icon={Detail.factIcon(field.value.href)}>
								<Detail.Value value={field.value} />
							</Detail.Fact>
						{/if}
					{/each}
				</Detail.Facts>
			{/if}
		</Detail.Identity>
		{#if data.edit?.canEdit}
			<Detail.HeaderActions>
				<EditRecord
					type={data.edit.type}
					recordId={data.record.id}
					form={data.edit.editForm}
					pickers={data.edit.editPickers}
				/>
			</Detail.HeaderActions>
		{/if}
	</Detail.Header>

	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<Tabs.Root bind:value={tab} variant="underline" class="gap-5">
			<Tabs.List>
				<Tabs.Trigger value="overview"><LayoutDashboardIcon />Overview</Tabs.Trigger>
				{#if stock}
					<Tabs.Trigger value="inventory"><PackageIcon />Inventory</Tabs.Trigger>
				{/if}
				{#if data.orderLines}
					<Tabs.Trigger value="orders">
						<ShoppingCartIcon />{orderTerms.name}
						{@render count(data.orderLines.length)}
					</Tabs.Trigger>
				{/if}
				{#if data.purchaseLines}
					<Tabs.Trigger value="purchases">
						<TruckIcon />{purchaseTerms.name}
						{@render count(data.purchaseLines.length)}
					</Tabs.Trigger>
				{/if}
				<Tabs.Trigger value="relationships">
					<ShareIcon />Relationships
					{@render count(data.relationships.length)}
				</Tabs.Trigger>
				<Tabs.Trigger value="activity">
					<ActivityIcon />Activity
					{@render count(data.activities.length)}
				</Tabs.Trigger>
				{#each data.related as group (group.kind)}
					{@const GroupIcon = iconFor(iconForPath(recordListHref(group.kind), page.data.nav ?? []))}
					<Tabs.Trigger value={group.kind}>
						<GroupIcon />{recordTerms(page.data.terms, group.kind).name}
						{@render count(group.records.length)}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>

			<Tabs.Content value="overview">
				{#if tab === 'overview'}{@render overview()}{/if}
			</Tabs.Content>

			{#if stock}
				<Tabs.Content value="inventory">
					{#if tab === 'inventory'}{@render inventory(stock)}{/if}
				</Tabs.Content>
			{/if}

			{#if data.orderLines}
				<Tabs.Content value="orders">
					{#if tab === 'orders'}{@render orders(data.orderLines)}{/if}
				</Tabs.Content>
			{/if}

			{#if data.purchaseLines}
				<Tabs.Content value="purchases">
					{#if tab === 'purchases'}{@render purchases(data.purchaseLines)}{/if}
				</Tabs.Content>
			{/if}

			<Tabs.Content value="relationships">
				{#if tab === 'relationships'}
					<Detail.Relationships
						relationships={data.relationships}
						typeOptions={data.relationshipTypeOptions}
						otherKinds={data.relationshipOtherKinds}
						canManage={data.canManageRelationships}
						form={data.relationshipForms.add}
						removeForm={data.relationshipForms.remove}
						graphHref={data.graphHref}
						noun={terms.noun}
						{queryKey}
					/>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="activity">
				{#if tab === 'activity'}
					<Card.Root>
						<Card.Header>
							<Card.Title>Activity</Card.Title>
							<Card.Description>
								Calls, emails, meetings and notes logged against this {terms.noun}, newest first.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<Detail.Timeline
								activities={data.activities}
								people={data.people}
								noun={terms.noun}
							/>
						</Card.Content>
					</Card.Root>
				{/if}
			</Tabs.Content>

			{#each data.related as group (group.kind)}
				<Tabs.Content value={group.kind}>
					{#if tab === group.kind}
						<Detail.RelatedGroup
							{group}
							terms={recordTerms(page.data.terms, group.kind)}
							noun={terms.noun}
						/>
					{/if}
				</Tabs.Content>
			{/each}
		</Tabs.Root>

		<Detail.Rail>
			{#if sales}
				<Detail.RailSection bind:open={salesOpen} title="Sales performance">
					{#snippet actions()}
						<span class="text-muted-foreground text-xs">Last {sales.days} days</span>
					{/snippet}

					<div class="space-y-3">
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<p class="text-2xl font-semibold tracking-tight tabular-nums">
								{money.format(sales.current.revenue)}
							</p>
							{#if sales.change !== null}
								<StatusBadge tone={sales.change >= 0 ? 'success' : 'error'}>
									{#if sales.change >= 0}
										<TrendingUpIcon />
									{:else}
										<TrendingDownIcon />
									{/if}
									{percent.format(sales.change)} vs prior {sales.days} days
								</StatusBadge>
							{:else if sales.current.revenue > 0}
								<span class="text-muted-foreground text-xs">Nothing in the prior period</span>
							{/if}
						</div>

						{#if sales.current.orders > 0}
							<SalesSparkline series={sales.series} currency={data.product.currency} />
						{:else}
							<p class="text-muted-foreground text-sm">
								No confirmed {orderTerms.plural} in the last {sales.days} days.
							</p>
						{/if}

						<dl class="grid grid-cols-3 gap-3 border-t pt-3">
							{@render figure('Units sold', quantity.format(sales.current.units))}
							{@render figure(capitalize(orderTerms.plural), quantity.format(sales.current.orders))}
							{@render figure(
								`Avg. ${orderTerms.noun}`,
								sales.current.averageOrder === null ? '—' : money.format(sales.current.averageOrder)
							)}
						</dl>
					</div>
				</Detail.RailSection>
			{/if}

			{#if stock}
				<Detail.RailSection
					bind:open={stockOpen}
					title="Inventory"
					class={sales ? 'border-t pt-6' : ''}
				>
					{#snippet actions()}
						<Button variant="ghost" size="sm" onclick={() => (tab = 'inventory')}>Details</Button>
					{/snippet}

					<div class="space-y-3">
						<dl class="grid grid-cols-3 gap-3">
							{@render figure('On hand', quantity.format(stock.onHand))}
							{@render figure(
								'Allocated',
								stock.allocated === null ? '—' : quantity.format(stock.allocated)
							)}
							{@render figure(
								'Available',
								quantity.format(stock.available),
								stock.available <= 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
							)}
						</dl>
						{#if stock.allocated !== null && stock.onHand > 0}
							<ProgressBar
								value={Math.max(0, stock.available)}
								max={stock.onHand}
								label="Available of on hand"
							/>
						{/if}
					</div>
				</Detail.RailSection>
			{/if}

			<Detail.RailSection
				bind:open={detailsOpen}
				title="{capitalize(terms.noun)} details"
				class={sales || stock ? 'border-t pt-6' : ''}
			>
				{#snippet actions()}
					{#if data.edit?.canEdit}
						<EditRecord
							compact
							type={data.edit.type}
							recordId={data.record.id}
							form={data.edit.editForm}
							pickers={data.edit.editPickers}
						/>
					{/if}
				{/snippet}

				<dl class="space-y-3">
					{#each details as field (field.label)}
						<Detail.Field label={field.label} value={field.value} people={data.people} />
					{/each}
					{#if data.product.msrp !== null}
						<Detail.Field
							label="List price"
							value={{
								type: 'money',
								value: data.product.msrp,
								currency: data.product.currency,
								unit: null
							}}
						/>
					{/if}
					{#if margin !== null}
						<Detail.Field label="Margin" value={{ type: 'text', value: percent.format(margin) }} />
					{/if}
				</dl>

				{#if data.customFields.length > 0}
					<div class="space-y-3 border-t pt-5">
						<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Custom fields
						</p>
						<dl class="space-y-3">
							{#each data.customFields as field (field.key)}
								<Detail.Field label={field.label} value={field.value} />
							{/each}
						</dl>
					</div>
				{/if}

				<dl class="space-y-3 border-t pt-5">
					<Detail.Field
						label="Created"
						value={{ type: 'datetime', value: data.record.createdAt }}
					/>
					{#if data.record.createdBy}
						<Detail.Field
							label="Created by"
							value={{ type: 'person', userId: data.record.createdBy }}
							people={data.people}
						/>
					{/if}
					<Detail.Field
						label="Updated"
						value={{ type: 'datetime', value: data.record.updatedAt }}
					/>
					<div class="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-3">
						<dt class="text-muted-foreground truncate text-sm">ID</dt>
						<dd class="flex items-center gap-1">
							<code class="font-mono text-xs">{data.record.id.slice(0, 8)}…</code>
							<CopyButton value={data.record.id} label="Copy" copiedLabel="Copied" class="h-7" />
						</dd>
					</div>
				</dl>
			</Detail.RailSection>

			{#if data.notes}
				<Detail.RailSection bind:open={notesOpen} title="Notes" class="border-t pt-6">
					<Detail.Notes
						notes={data.notes}
						noun={terms.noun}
						autofocusId={addedNoteId}
						onadd={addNote}
						onsave={(id, patch) => noteCommands.save(id, patch)}
						onarchive={(id) => noteCommands.archive(id, true)}
					/>
				</Detail.RailSection>
			{/if}
		</Detail.Rail>
	</div>
</div>

<!-- How many a tab holds, after its name. -->
{#snippet count(n: number)}
	{#if n > 0}
		<span class="text-muted-foreground tabular-nums">{n}</span>
	{/if}
{/snippet}

<!-- One figure in a rail section: a small label over a number. -->
{#snippet figure(label: string, value: string, tone = '')}
	<div class="min-w-0">
		<dt class="text-muted-foreground truncate text-xs">{label}</dt>
		<dd class="truncate text-sm font-semibold tabular-nums {tone}">{value}</dd>
	</div>
{/snippet}

<!--
	The pictures first — the reason this kind has a page of its own — then
	what the storefront says about it, then the latest of the timeline.
-->
{#snippet overview()}
	<div class="space-y-6">
		<ProductMedia
			imageUrl={data.product.imageUrl}
			gallery={data.product.gallery}
			name={data.record.name}
			form={data.imageForm}
			removeForm={data.removeImageForm}
			canManage={canManageImage}
			{queryKey}
		/>

		<Card.Root>
			<Card.Header>
				<Card.Title>{capitalize(terms.noun)} information</Card.Title>
				<Card.Description>What a buyer reads about it.</Card.Description>
				{#if data.edit?.canEdit}
					<Card.Action>
						<EditRecord
							compact
							type={data.edit.type}
							recordId={data.record.id}
							form={data.edit.editForm}
							pickers={data.edit.editPickers}
						/>
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid gap-1">
					<p class="text-muted-foreground text-xs font-medium">Name</p>
					<p class="text-sm font-medium">{data.record.name}</p>
				</div>
				<div class="grid gap-1">
					<p class="text-muted-foreground text-xs font-medium">Description</p>
					{#if data.product.description}
						<p class="text-sm whitespace-pre-line">{data.product.description}</p>
					{:else}
						<p class="text-muted-foreground text-sm">No short description yet.</p>
					{/if}
				</div>
				{#if data.product.longDescription}
					<div class="grid gap-1">
						<p class="text-muted-foreground text-xs font-medium">Storefront body</p>
						<p class="text-sm whitespace-pre-line">{data.product.longDescription}</p>
					</div>
				{/if}
				<dl class="grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
					{@render figure(
						'Unit price',
						`${money.format(data.product.unitPrice)}${data.product.unit ? ` / ${data.product.unit}` : ''}`
					)}
					{@render figure(
						'Unit cost',
						data.product.unitCost === null ? '—' : money.format(data.product.unitCost)
					)}
					{@render figure('Margin', margin === null ? '—' : percent.format(margin))}
					{@render figure(
						'List price',
						data.product.msrp === null ? '—' : money.format(data.product.msrp)
					)}
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Recent activity</Card.Title>
				<Card.Description>The latest logged against this {terms.noun}.</Card.Description>
				{#if data.activities.length > RECENT}
					<Card.Action>
						<Button variant="ghost" size="sm" onclick={() => (tab = 'activity')}>View all</Button>
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content>
				<Detail.Timeline activities={recentActivities} people={data.people} noun={terms.noun} />
			</Card.Content>
		</Card.Root>
	</div>
{/snippet}

<!-- What is on the shelf, and every confirmed line still waiting to leave it. -->
{#snippet inventory(level: NonNullable<typeof stock>)}
	<Card.Root>
		<Card.Header>
			<Card.Title>Inventory</Card.Title>
			<Card.Description>
				On hand is the count on the {terms.noun}; allocated is what confirmed {orderTerms.plural}
				have not shipped yet.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-5">
			<dl class="grid grid-cols-3 gap-3">
				{@render figure('On hand', quantity.format(level.onHand))}
				{@render figure(
					'Allocated',
					level.allocated === null ? '—' : quantity.format(level.allocated)
				)}
				{@render figure(
					'Available',
					quantity.format(level.available),
					level.available <= 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
				)}
			</dl>
			{#if data.orderLines}
				{@const waiting = data.orderLines.filter(
					(line) =>
						line.orders.status === 'confirmed' &&
						(line.fulfillment_status === 'pending' ||
							line.fulfillment_status === 'processing' ||
							line.fulfillment_status === 'backordered')
				)}
				{#if waiting.length > 0}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{capitalize(orderTerms.noun)}</Table.Head>
								<Table.Head>Customer</Table.Head>
								<Table.Head class="text-right">Qty</Table.Head>
								<Table.Head>Status</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each waiting as line (line.id)}
								<Table.Row>
									<Table.Cell>
										<a
											href={recordHref('order', line.orders.id)}
											class="font-medium hover:underline"
										>
											{line.orders.number}
										</a>
									</Table.Cell>
									<Table.Cell class="text-muted-foreground">
										{line.orders.companies?.name ?? line.orders.contacts?.name ?? '—'}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums"
										>{quantity.format(line.quantity)}</Table.Cell
									>
									<Table.Cell>
										<StatusBadge tone={LINE_FULFILLMENT_TONE[line.fulfillment_status]}>
											{capitalize(line.fulfillment_status)}
										</StatusBadge>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<p class="text-muted-foreground text-sm">Nothing is waiting to ship.</p>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
{/snippet}

<!-- Every order line that cites this product, newest first. -->
{#snippet orders(lines: NonNullable<typeof data.orderLines>)}
	<Card.Root>
		<Card.Header>
			<Card.Title>{orderTerms.name}</Card.Title>
			<Card.Description>Every {orderTerms.noun} line that names this {terms.noun}.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			{#if lines.length === 0}
				<Empty.Root class="p-6">
					<Empty.Header>
						<Empty.Title class="text-base">No {orderTerms.plural} yet</Empty.Title>
						<Empty.Description>
							A line on an {orderTerms.noun} that picks this {terms.noun} shows here.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{capitalize(orderTerms.noun)}</Table.Head>
							<Table.Head>Customer</Table.Head>
							<Table.Head>Date</Table.Head>
							<Table.Head class="text-right">Qty</Table.Head>
							<Table.Head class="text-right">Unit price</Table.Head>
							<Table.Head class="text-right">Total</Table.Head>
							<Table.Head>Status</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each lines as line (line.id)}
							<Table.Row>
								<Table.Cell>
									<a href={recordHref('order', line.orders.id)} class="font-medium hover:underline">
										{line.orders.number}
									</a>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{line.orders.companies?.name ?? line.orders.contacts?.name ?? '—'}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground whitespace-nowrap">
									{mediumDate.format(new Date(line.orders.confirmed_at ?? line.orders.created_at))}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums"
									>{quantity.format(line.quantity)}</Table.Cell
								>
								<Table.Cell class="text-right tabular-nums"
									>{money.format(line.unit_price)}</Table.Cell
								>
								<Table.Cell class="text-right font-medium tabular-nums">
									{money.format(line.net_amount ?? line.line_total ?? 0)}
								</Table.Cell>
								<Table.Cell>
									<span class="flex flex-wrap gap-1">
										<StatusBadge tone={ORDER_STATUS_TONE[line.orders.status]}>
											{capitalize(line.orders.status)}
										</StatusBadge>
										{#if line.orders.status === 'confirmed'}
											<StatusBadge tone={LINE_FULFILLMENT_TONE[line.fulfillment_status]}>
												{capitalize(line.fulfillment_status)}
											</StatusBadge>
										{/if}
									</span>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
{/snippet}

<!-- Who it is bought from and what it cost, newest first. -->
{#snippet purchases(lines: NonNullable<typeof data.purchaseLines>)}
	<Card.Root>
		<Card.Header>
			<Card.Title>{purchaseTerms.name}</Card.Title>
			<Card.Description
				>Every {purchaseTerms.noun} line that names this {terms.noun}.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			{#if lines.length === 0}
				<Empty.Root class="p-6">
					<Empty.Header>
						<Empty.Title class="text-base">No {purchaseTerms.plural} yet</Empty.Title>
						<Empty.Description>
							A line on a {purchaseTerms.noun} that picks this {terms.noun} shows here.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{capitalize(purchaseTerms.noun)}</Table.Head>
							<Table.Head>Vendor</Table.Head>
							<Table.Head>Date</Table.Head>
							<Table.Head class="text-right">Ordered</Table.Head>
							<Table.Head class="text-right">Received</Table.Head>
							<Table.Head class="text-right">Unit cost</Table.Head>
							<Table.Head>Status</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each lines as line (line.id)}
							<Table.Row>
								<Table.Cell>
									<a
										href={recordHref('purchase', line.purchases.id)}
										class="font-medium hover:underline"
									>
										{line.purchases.number}
									</a>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{line.purchases.companies?.name ?? '—'}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground whitespace-nowrap">
									{mediumDate.format(
										new Date(line.purchases.ordered_at ?? line.purchases.created_at)
									)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{quantity.format(line.quantity_ordered)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{quantity.format(line.quantity_received)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{new Intl.NumberFormat('en-US', {
										style: 'currency',
										currency: line.purchases.currency
									}).format(line.landed_unit_cost ?? line.unit_cost)}
								</Table.Cell>
								<Table.Cell>
									<StatusBadge tone={PURCHASE_STATUS_TONE[line.purchases.status]}>
										{capitalize(line.purchases.status.replace('_', ' '))}
									</StatusBadge>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
{/snippet}
