<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import HandshakeIcon from '@lucide/svelte/icons/handshake';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import ShareIcon from '@lucide/svelte/icons/share-2';
	import UsersIcon from '@lucide/svelte/icons/users';
	import WalletIcon from '@lucide/svelte/icons/wallet';
	import * as Detail from '$lib/components/detail/index.js';
	import EditRecord from '$lib/components/edit-record.svelte';
	import { SegmentedControl } from '$lib/components/enhanced/segmented-control/index.js';
	import { CopyButton } from '$lib/components/enhanced/index.js';
	import * as Ledger from '$lib/components/ledger/index.js';
	import * as MapView from '$lib/components/map-view/index.js';
	import * as RelationshipGraph from '$lib/components/relationship-graph/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import {
		egoGraph,
		filterGraph,
		swatchAt,
		type GraphNode,
		type GraphNodeKind,
		type Swatch
	} from '$lib/crm/graph';
	import { summarizeLedger, withRunningBalance } from '$lib/crm/ledger';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';
	import { noteCommands } from '$lib/notes-api';
	import { QUERY } from '$lib/queries';
	import { capitalize } from '$lib/utils.js';

	let { data } = $props();

	// Every word on this page is the industry's: "Merchant" in merchant
	// services, "Landlord" for a letting agent, "Company" by default.
	const terms = $derived(recordTerms(page.data.terms, 'company'));
	const contactTerms = $derived(recordTerms(page.data.terms, 'contact'));
	const dealTerms = $derived(recordTerms(page.data.terms, 'deal'));

	const money = (value: number, currency = 'USD') =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	// Fixed locale, like every date on a page — see the staff page.
	const datetime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

	const queryKey = $derived(QUERY.record('company', data.record.id));

	/**
	 * The ways to reach the company, as chips under its name. Unlike the
	 * generic page these are NOT taken out of the rail: the rail is this
	 * record's whole attribute panel, and the Edit button sits on it — a panel
	 * missing the fields that button is about to open reads as a bug. So the
	 * header is "how to reach it now" and the rail is "everything it is".
	 */
	const facts = $derived(data.record.fields.filter((field) => field.value.type === 'link'));

	/** Where it is, in one line — the fact an address card buries three rows down. */
	const where = $derived.by(() => {
		const primary = data.addresses.find((address) => address.is_primary) ?? data.addresses[0];
		if (!primary) return null;
		const parts = [primary.city, primary.region, primary.country].filter(
			(part): part is string => part !== null && part !== ''
		);
		return parts.length > 0 ? parts.join(', ') : null;
	});

	// The people who work here, from the related group the shell already read.
	const peopleGroup = $derived(data.related.find((group) => group.kind === 'contact') ?? null);

	/** What is still in play, and what it is worth — a closed stage is history. */
	const pipeline = $derived.by(() => {
		const open = data.deals.filter((deal) => deal.outcome === 'open');
		return {
			count: open.length,
			value: open.reduce((sum, deal) => sum + (deal.amount ?? 0), 0)
		};
	});

	// The account, summed by the viewer's own date: "overdue" is a wall-clock
	// word, exactly as it is on /ledger and on the task board.
	const now = new Date();
	const account = $derived(data.ledger ? summarizeLedger(data.ledger, now) : null);
	const statement = $derived(data.ledger ? withRunningBalance(data.ledger) : []);
	const currency = $derived(data.ledger?.[0]?.currency ?? 'USD');

	/**
	 * The tabs: the overview, then this record's relationships drawn whole —
	 * the reason this page is its own — then the timeline, the money, where it
	 * is, and one tab per group of records pointing here.
	 */
	let tab = $state('overview');

	const RECENT = 4;
	const recentActivities = $derived(data.activities.slice(0, RECENT));

	// ── The graph ──────────────────────────────────────────────────────────
	// The whole map the server described, narrowed to this company's
	// neighbourhood. One hop is who it deals with; two is who they deal with
	// in turn — the reader's choice, because which one is useful depends on
	// how connected the record is.
	let depth = $state(1);
	const depthOptions = [
		{ value: '1', label: '1 hop' },
		{ value: '2', label: '2 hops' }
	];
	let showEnded = $state(true);
	// What the reader has switched off, rather than what is on: a neighbourhood
	// that grows a new kind or type shows it without the page having to notice.
	const hiddenKinds = new SvelteSet<GraphNodeKind>();
	const hiddenTypes = new SvelteSet<string>();

	const around = $derived(
		data.graph
			? egoGraph(data.graph, data.focus, depth)
			: { nodes: [], edges: [], kinds: [], types: [] }
	);
	/** Each kind's colour, in legend order — the same swatch on the map and in the legend. */
	const swatches = $derived<Record<string, Swatch>>(
		Object.fromEntries(around.kinds.map((kind, index) => [kind.kind, swatchAt(index)]))
	);
	// The same fold the whole map uses, so switching a kind off means the same
	// thing here as it does on /graph.
	const shown = $derived(
		filterGraph(around, {
			kinds: new Set(around.kinds.flatMap((k) => (hiddenKinds.has(k.kind) ? [] : [k.kind]))),
			types: new Set(around.types.flatMap((t) => (hiddenTypes.has(t.id) ? [] : [t.id]))),
			ended: showEnded
		})
	);
	const kindItems = $derived(
		around.kinds.map((kind) => ({
			id: kind.kind,
			label: kind.label,
			count: kind.count,
			checked: !hiddenKinds.has(kind.kind),
			swatch: swatches[kind.kind]
		}))
	);
	const typeItems = $derived(
		around.types.map((type) => ({
			id: type.id,
			label: type.label,
			count: type.count,
			checked: !hiddenTypes.has(type.id)
		}))
	);

	function toggleKind(id: string) {
		const kind = around.kinds.find((k) => k.kind === id)?.kind;
		if (!kind) return;
		if (hiddenKinds.has(kind)) hiddenKinds.delete(kind);
		else hiddenKinds.add(kind);
	}

	function toggleType(id: string) {
		if (hiddenTypes.has(id)) hiddenTypes.delete(id);
		else hiddenTypes.add(id);
	}

	/** A node is the record: open it. A member has no page, so a click on one is a no-op. */
	function open(node: GraphNode) {
		if (node.href) goto(node.href);
	}

	// ── Notes ──────────────────────────────────────────────────────────────
	/** The note the button just made, so the caret lands in it. */
	let addedNoteId = $state<string | null>(null);

	async function addNote() {
		const note = await noteCommands.create({ entityType: 'company', entityId: data.record.id });
		if (note) addedNoteId = note.id;
	}

	// The rail's two sections, open until this reader folds one away.
	let detailsOpen = $state(true);
	let notesOpen = $state(true);
</script>

<div class="space-y-6">
	<!-- Who it is, how to reach it, and where it is. -->
	<Detail.Header>
		<Detail.Back href={recordListHref('company')} label="All {terms.plural}" />
		<Detail.Identity
			id={data.record.id}
			name={data.record.name}
			pills={data.record.pills}
			tags={data.tags}
		>
			{#if facts.length > 0 || where}
				<Detail.Facts>
					{#each facts as field (field.label)}
						{#if field.value.type === 'link'}
							<Detail.Fact icon={Detail.factIcon(field.value.href)}>
								<Detail.Value value={field.value} />
							</Detail.Fact>
						{/if}
					{/each}
					{#if where}
						<Detail.Fact icon={MapPinIcon}>{where}</Detail.Fact>
					{/if}
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
				<Tabs.Trigger value="overview"><UsersIcon />Overview</Tabs.Trigger>
				{#if data.graph}
					<Tabs.Trigger value="relationships">
						<ShareIcon />Relationships
						{@render count(data.relationships.length)}
					</Tabs.Trigger>
				{/if}
				<Tabs.Trigger value="activity">
					<ActivityIcon />Activity
					{@render count(data.activities.length)}
				</Tabs.Trigger>
				{#if data.ledger}
					<Tabs.Trigger value="account"><WalletIcon />Account</Tabs.Trigger>
				{/if}
				<Tabs.Trigger value="addresses">
					<MapPinIcon />Addresses
					{@render count(data.addresses.length)}
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

			{#if data.graph}
				<Tabs.Content value="relationships" class="space-y-6">
					{#if tab === 'relationships'}{@render relationships()}{/if}
				</Tabs.Content>
			{/if}

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

			{#if data.ledger}
				<Tabs.Content value="account">
					{#if tab === 'account'}{@render ledgerTab()}{/if}
				</Tabs.Content>
			{/if}

			<Tabs.Content value="addresses" class="space-y-6">
				{#if tab === 'addresses'}
					{#if data.pins.length > 0}
						<MapView.Root
							pins={data.pins}
							styleUrl={data.map.styleUrl}
							darkStyleUrl={data.map.darkStyleUrl}
							aria-label="{data.record.name} on a map"
							class="h-72"
						/>
					{/if}
					<Detail.Addresses
						addresses={data.addresses}
						form={data.addressForm}
						removeForm={data.removeAddressForm}
						locateForm={data.locateAddressForm}
						canManage={data.canManageAddresses}
						noun={terms.noun}
						{queryKey}
					/>
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
			<Detail.RailSection bind:open={detailsOpen} title="{capitalize(terms.noun)} details">
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
					{#each data.record.fields as field (field.label)}
						<Detail.Field label={field.label} value={field.value} people={data.people} />
					{/each}
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

<!-- One figure at the top of the record, and the tab it opens. -->
{#snippet stat(
	label: string,
	Icon: typeof ActivityIcon,
	value: string,
	meta: string | null,
	to: string
)}
	<button
		type="button"
		class="bg-card hover:bg-accent/50 rounded-xl border p-4 text-left transition-colors"
		onclick={() => (tab = to)}
	>
		<p class="text-muted-foreground flex items-center gap-1.5 text-xs">
			<Icon class="size-3.5" />
			{label}
		</p>
		<p class="mt-1.5 truncate text-sm font-medium">{value}</p>
		<p class="text-muted-foreground truncate text-xs">{meta ?? ' '}</p>
	</button>
{/snippet}

<!--
	The summary: what this account is worth and who is on it, then the people
	who work here, then the latest of the timeline.
-->
{#snippet overview()}
	<div class="space-y-6">
		<section class="space-y-3">
			<h2 class="text-sm font-medium">Highlights</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{#if data.activities[0]}
					{@const latest = data.activities[0]}
					{@render stat(
						'Last activity',
						ActivityIcon,
						latest.subject ?? capitalize(latest.type),
						datetime.format(new Date(latest.occurred_at)),
						'activity'
					)}
				{:else}
					{@render stat('Last activity', ActivityIcon, 'Nothing logged yet', null, 'activity')}
				{/if}

				{#if peopleGroup}
					{@render stat(
						contactTerms.name,
						UsersIcon,
						String(peopleGroup.records.length),
						peopleGroup.records.length === 1 ? contactTerms.noun : contactTerms.plural,
						'contact'
					)}
				{/if}

				{#if data.deals.length > 0}
					{@render stat(
						`Open ${dealTerms.plural}`,
						HandshakeIcon,
						money(pipeline.value),
						`${String(pipeline.count)} of ${String(data.deals.length)} still open`,
						'deal'
					)}
				{/if}

				{#if account}
					{@render stat(
						'Outstanding',
						WalletIcon,
						money(account.outstanding, currency),
						account.overdue > 0 ? `${money(account.overdue, currency)} overdue` : 'Nothing overdue',
						'account'
					)}
				{/if}
			</div>
		</section>

		{#if peopleGroup}
			{@const people = peopleGroup.records}
			<Card.Root>
				<Card.Header>
					<Card.Title>{contactTerms.name}</Card.Title>
					<Card.Description>
						Who works at this {terms.noun}.
					</Card.Description>
					<Card.Action>
						<Button variant="ghost" size="sm" onclick={() => (tab = 'contact')}>View all</Button>
					</Card.Action>
				</Card.Header>
				<Card.Content>
					<ul class="grid gap-3 sm:grid-cols-2">
						{#each people as person (person.id)}
							<li>
								<svelte:element
									this={data.canOpenContacts ? 'a' : 'div'}
									href={data.canOpenContacts ? person.href : undefined}
									class="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
								>
									<div
										class="{Avatar.avatarTint(
											person.id
										)} flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
									>
										{Detail.recordInitials(person.name)}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{person.name}</p>
										{#if person.meta}
											<p class="text-muted-foreground truncate text-xs">{person.meta}</p>
										{/if}
									</div>
									{#if person.pill}
										<StatusBadge tone={person.pill.tone}>{person.pill.label}</StatusBadge>
									{/if}
								</svelte:element>
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/if}

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

<!--
	This company's corner of the graph, drawn whole: the map first, then the
	card that draws and removes a relationship — the same write surface every
	record page has, so a relationship means one thing everywhere.
-->
{#snippet relationships()}
	<Card.Root>
		<Card.Header>
			<Card.Title>Around this {terms.noun}</Card.Title>
			<Card.Description>
				Every record {data.record.name} is connected to, and how. Click one to open it.
			</Card.Description>
			<Card.Action>
				<div class="flex flex-wrap items-center gap-3">
					<div class="flex items-center gap-2">
						<Switch id="show-ended" bind:checked={showEnded} />
						<Label for="show-ended" class="font-normal">Show ended</Label>
					</div>
					<SegmentedControl
						label="How far out"
						options={depthOptions}
						value={String(depth)}
						onValueChange={(value) => (depth = value === '2' ? 2 : 1)}
					/>
				</div>
			</Card.Action>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if around.nodes.length <= 1}
				<Empty.Root class="border">
					<Empty.Header>
						<Empty.Title>Nothing connected yet</Empty.Title>
						<Empty.Description>
							Draw a relationship below and this {terms.noun} joins the map.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<RelationshipGraph.Root
					nodes={shown.nodes}
					edges={shown.edges}
					{swatches}
					focus={data.focus}
					onopen={open}
					class="h-[28rem]"
				/>
				<div class="grid gap-4 sm:grid-cols-2">
					<RelationshipGraph.Legend title="Records" items={kindItems} ontoggle={toggleKind} />
					<RelationshipGraph.Legend title="Relationships" items={typeItems} ontoggle={toggleType} />
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

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
{/snippet}

<!-- The account: what it adds up to, then every charge and payment on it. -->
{#snippet ledgerTab()}
	{#if account}
		<div class="space-y-6">
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Ledger.Stat label="Outstanding" value={money(account.outstanding, currency)} />
				<Ledger.Stat
					label="Overdue"
					value={money(account.overdue, currency)}
					class={account.overdue > 0 ? 'text-destructive' : undefined}
				/>
				<Ledger.Stat label="Credit on account" value={money(account.unapplied, currency)} />
				<Ledger.Stat label="Collected, last 30 days" value={money(account.collected, currency)} />
			</div>

			<Card.Root>
				<Card.Header>
					<Card.Title>Statement</Card.Title>
					<Card.Description>
						Every invoice issued to this {terms.noun} and every payment received, newest first.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if statement.length === 0}
						<Empty.Root class="p-6">
							<Empty.Header>
								<Empty.Title class="text-base">Nothing billed yet</Empty.Title>
								<Empty.Description>
									An invoice issued to this {terms.noun} shows up here.
								</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{:else}
						<ul class="divide-border divide-y">
							{#each statement as entry (entry.id)}
								<li class="flex items-center justify-between gap-3 py-2.5">
									<Ledger.EntryCell {entry} />
									<div class="shrink-0 text-right">
										<p class="text-sm font-medium tabular-nums">
											{entry.delta >= 0 ? '' : '−'}{money(Math.abs(entry.delta), entry.currency)}
										</p>
										<p class="text-muted-foreground text-xs tabular-nums">
											Balance {money(entry.balance, entry.currency)}
										</p>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
{/snippet}
