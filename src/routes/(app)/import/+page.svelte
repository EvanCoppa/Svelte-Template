<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import TablePropertiesIcon from '@lucide/svelte/icons/table-properties';
	import { toast } from 'svelte-sonner';
	import { fileProxy, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import * as Import from '$lib/components/import/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import {
		IMPORT_FILE_EXTENSIONS,
		IMPORT_FORM_IDS,
		importUploadSchema,
		isImportKind,
		isRowDecision,
		importFields,
		type PreviewRow,
		type PreviewStatus,
		type RowDecision
	} from '$lib/schemas/imports';
	import { RECORD_FORMS } from '$lib/schemas/records';
	import { cn } from '$lib/utils.js';

	/**
	 * Pick a kind, drop a file, review every row, import the ones you approve
	 * (docs/imports.md). The page owns the preview the `preview` action
	 * answered with and every decision made on it; the `commit` action gets
	 * the rows back as JSON with those decisions and answers with a result.
	 * Both arrive on `form` (the action data), so a new preview replaces the
	 * last result and a result replaces the preview it came from.
	 */
	let { data, form } = $props();

	const preview = $derived(form?.preview ?? null);
	const result = $derived(form?.result ?? null);

	// --- Step one: the kind and the file --------------------------------------

	const kindOptions = $derived(
		data.kinds.map((candidate) => ({
			value: candidate,
			label: recordTerms(page.data.terms, candidate).name
		}))
	);
	let guideOpen = $state(false);

	const {
		form: upload,
		errors: uploadErrors,
		message: uploadMessage,
		submitting: uploading,
		enhance: uploadEnhance
	} = superForm(data.uploadForm, {
		id: IMPORT_FORM_IDS.upload,
		validators: zod4Client(importUploadSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form: submitted }) {
			// A fresh preview starts with fresh decisions.
			if (submitted.valid) {
				overrides = {};
				filter = 'all';
				shown = PAGE;
			}
		}
	});

	/** The chosen file, as the form store sees it — so client validation and the drop zone agree. */
	const file = fileProxy(upload, 'file');

	/** The kind the picker holds, narrowed: the store's value is whatever the picker last posted. */
	const kind = $derived(isImportKind($upload.kind) ? $upload.kind : undefined);
	const terms = $derived(kind ? recordTerms(page.data.terms, kind) : null);

	// --- Step two: the decisions ------------------------------------------------

	/** What happens to rows that match an existing record, unless a row says otherwise. */
	let matchDefault = $state<RowDecision>('update');
	/** Per-row choices, by spreadsheet line. */
	let overrides = $state<Record<number, RowDecision>>({});

	function decisionFor(row: PreviewRow): RowDecision {
		return overrides[row.line] ?? (row.status === 'match' ? matchDefault : 'create');
	}

	function decide(row: PreviewRow, value: string) {
		if (isRowDecision(value)) overrides[row.line] = value;
	}

	const MATCH_DECISIONS = [
		{ value: 'update', label: 'Overwrite existing' },
		{ value: 'create', label: 'Add as new' },
		{ value: 'skip', label: 'Skip' }
	] as const;

	const NEW_DECISIONS = [
		{ value: 'create', label: 'Add' },
		{ value: 'skip', label: 'Skip' }
	] as const;

	/** What the commit will post: every importable row with its decision — never an invalid or a duplicate one. */
	const posted = $derived(
		(preview?.rows ?? [])
			.filter((row) => row.status === 'new' || row.status === 'match')
			.map((row) => ({
				line: row.line,
				decision: decisionFor(row),
				existingId: row.match?.id ?? '',
				values: row.values
			}))
	);
	const willCreate = $derived(posted.filter((row) => row.decision === 'create').length);
	const willUpdate = $derived(posted.filter((row) => row.decision === 'update').length);
	const canCommit = $derived(
		preview !== null && preview.missingRequired.length === 0 && willCreate + willUpdate > 0
	);

	const {
		message: commitMessage,
		submitting: committing,
		enhance: commitEnhance
	} = superForm(data.commitForm, {
		id: IMPORT_FORM_IDS.commit,
		dataType: 'json',
		invalidateAll: false,
		resetForm: false,
		onSubmit({ jsonData, cancel }) {
			if (!preview || !canCommit) return cancel();
			jsonData({ kind: preview.kind, rows: posted });
		},
		onUpdated({ form: submitted }) {
			if (!submitted.valid || !preview) return;
			toast.success('Import finished');
			// The list the rows landed in is what changed.
			invalidate(RECORD_FORMS[preview.kind].query);
		}
	});

	// --- The preview table ---------------------------------------------------------

	type Filter = 'all' | PreviewStatus;
	let filter = $state<Filter>('all');
	/** Long files are drawn a page at a time; the decisions cover every row regardless. */
	const PAGE = 100;
	let shown = $state(PAGE);

	const previewTerms = $derived(preview ? recordTerms(page.data.terms, preview.kind) : null);
	const previewFields = $derived(
		preview
			? importFields(preview.kind).filter((field) =>
					preview.mapping.some((entry) => entry.field === field.name)
				)
			: []
	);
	const unmappedHeaders = $derived(
		(preview?.mapping ?? []).filter((entry) => entry.field === null).map((entry) => entry.header)
	);
	const filtered = $derived(
		(preview?.rows ?? []).filter((row) => filter === 'all' || row.status === filter)
	);
	const visible = $derived(filtered.slice(0, shown));

	const FILTERS: { value: Filter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'new', label: 'New' },
		{ value: 'match', label: 'Existing' },
		{ value: 'invalid', label: 'Invalid' },
		{ value: 'duplicate', label: 'Duplicates' }
	];

	function setFilter(value: string) {
		filter = FILTERS.find((entry) => entry.value === value)?.value ?? 'all';
		shown = PAGE;
	}

	/** A field's label as the guide shows it — for a mapped column and for a missing one alike. */
	function labelFor(field: string): string {
		if (!preview) return field;
		return importFields(preview.kind).find((candidate) => candidate.name === field)?.label ?? field;
	}
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	{#if data.kinds.length === 0}
		<Card.Root>
			<Card.Content>
				<Empty.Root class="p-6">
					<Empty.Header>
						<Empty.Title class="text-base">Nothing to import</Empty.Title>
						<Empty.Description>
							Importing needs permission to manage a kind of record — companies, people, products,
							billables or assets. Ask an owner or admin for a role that grants it.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			</Card.Content>
		</Card.Root>
	{:else}
		<form
			method="POST"
			action="?/preview"
			enctype="multipart/form-data"
			class="space-y-6"
			use:uploadEnhance
		>
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<TablePropertiesIcon class="size-4" />
						What are you importing?
					</Card.Title>
					<Card.Description>
						Pick the kind of record the file holds. Its columns are listed below, and a template
						with the right headers is a click away.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-2 sm:max-w-sm">
						<Label for="import-kind">Kind of record</Label>
						<Combobox
							id="import-kind"
							name="kind"
							options={kindOptions}
							bind:value={$upload.kind}
							placeholder="Choose what to import"
							invalid={Boolean($uploadErrors.kind)}
							disabled={$uploading}
						/>
						{#if $uploadErrors.kind}
							<p class="text-destructive text-sm">{$uploadErrors.kind}</p>
						{/if}
					</div>

					{#if kind}
						<Collapsible.Root bind:open={guideOpen} class="rounded-lg border">
							<div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
								<Collapsible.Trigger
									class="flex items-center gap-2 text-sm font-medium [&[data-state=open]>svg]:rotate-180"
								>
									<ChevronDownIcon class="size-4 transition-transform" />
									Which columns can the file have?
								</Collapsible.Trigger>
								<Button variant="outline" size="sm" href={`/import/template/${kind}`} download>
									<DownloadIcon />
									Download template
								</Button>
							</div>
							<Collapsible.Content class="border-t">
								<Import.ColumnGuide {kind} />
								<p class="text-muted-foreground px-4 py-3 text-xs">
									Headers are matched by name, in any case or spacing; a column nothing matches is
									ignored and listed in the preview. Rows are matched to existing {terms?.plural} by the
									marked column, or by name when there is none.
								</p>
							</Collapsible.Content>
						</Collapsible.Root>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<FileSpreadsheetIcon class="size-4" />
						Upload the file
					</Card.Title>
					<Card.Description>
						CSV, TSV or Excel, up to 4MB and 5,000 rows. Nothing is written until you review the
						preview and confirm.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<FormAlert message={$uploadMessage} class="mb-0" />
					<Import.DropZone
						id="import-file"
						name="file"
						accept={IMPORT_FILE_EXTENSIONS.join(',')}
						bind:files={$file}
						invalid={Boolean($uploadErrors.file)}
						disabled={$uploading}
						description={terms
							? `The first row names the columns; ${terms.name.toLowerCase()} need a name.`
							: 'The first row names the columns.'}
					/>
					{#if $uploadErrors.file}
						<p class="text-destructive text-sm">{$uploadErrors.file}</p>
					{/if}
				</Card.Content>
				<Card.Footer class="justify-end">
					<Button type="submit" disabled={$uploading || !kind || !$file?.length}>
						{$uploading ? 'Reading…' : 'Review import'}
					</Button>
				</Card.Footer>
			</Card.Root>
		</form>
	{/if}

	{#if result}
		{@const resultTerms = recordTerms(page.data.terms, result.kind)}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<CircleCheckIcon class="size-4" />
					Import finished
				</Card.Title>
				<Card.Description>
					{result.created} added, {result.updated} overwritten, {result.skipped} skipped
					{#if result.failures.length > 0}
						, {result.failures.length} failed
					{/if}
					— see <a class="underline" href={recordListHref(result.kind)}>{resultTerms.name}</a>.
				</Card.Description>
			</Card.Header>
			{#if result.failures.length > 0}
				<Card.Content>
					<Alert.Root variant="destructive">
						<Alert.Title>{result.failures.length} rows were not written</Alert.Title>
						<Alert.Description>
							<ul class="list-disc space-y-0.5 pl-4">
								{#each result.failures as failure (failure.line)}
									<li>Row {failure.line}: {failure.message}</li>
								{/each}
							</ul>
						</Alert.Description>
					</Alert.Root>
				</Card.Content>
			{/if}
		</Card.Root>
	{/if}

	{#if preview && previewTerms}
		<form method="POST" action="?/commit" class="space-y-6" use:commitEnhance>
			<Card.Root>
				<Card.Header>
					<Card.Title>Preview: {preview.fileName}</Card.Title>
					<Card.Description>
						{preview.rows.length} rows read from “{preview.sheet}”. Every row is checked as the “Add {previewTerms.noun}”
						form would check it, and compared with the {previewTerms.plural}
						you already have.
					</Card.Description>
					<Card.Action class="flex flex-wrap items-center gap-2">
						<Import.RowStatus status="new" />
						<span class="text-sm font-medium">{preview.counts.new}</span>
						<Import.RowStatus status="match" />
						<span class="text-sm font-medium">{preview.counts.match}</span>
						<Import.RowStatus status="invalid" />
						<span class="text-sm font-medium">{preview.counts.invalid}</span>
						<Import.RowStatus status="duplicate" />
						<span class="text-sm font-medium">{preview.counts.duplicate}</span>
					</Card.Action>
				</Card.Header>
				<Card.Content class="space-y-4">
					<FormAlert message={$commitMessage} class="mb-0" />

					{#if preview.missingRequired.length > 0}
						<Alert.Root variant="destructive">
							<Alert.Title>The file is missing a required column</Alert.Title>
							<Alert.Description>
								No header was read as {preview.missingRequired.map(labelFor).join(', ')}. Add the
								column, or rename the one that holds it, and upload again.
							</Alert.Description>
						</Alert.Root>
					{/if}

					<div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
						<div>
							<span class="text-muted-foreground">Columns read:</span>
							{#each preview.mapping.filter((entry) => entry.field !== null) as entry (entry.header)}
								<StatusBadge tone="neutral" dot={false} size="sm" class="ml-1">
									{entry.header} → {labelFor(entry.field ?? '')}
								</StatusBadge>
							{/each}
						</div>
						{#if unmappedHeaders.length > 0}
							<div>
								<span class="text-muted-foreground">Ignored:</span>
								{#each unmappedHeaders as header (header)}
									<StatusBadge tone="warning" dot={false} size="sm" class="ml-1"
										>{header}</StatusBadge
									>
								{/each}
							</div>
						{/if}
					</div>

					{#if preview.counts.match > 0}
						<div class="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border p-3">
							<div class="min-w-0 flex-1">
								<Label for="import-match-default">
									{preview.counts.match} rows match a {previewTerms.noun} you already have
								</Label>
								<p class="text-muted-foreground text-sm">
									Overwriting writes the columns the file has; a blank cell keeps the current value.
									Change any one row below.
								</p>
							</div>
							<Combobox
								id="import-match-default"
								options={MATCH_DECISIONS}
								value={matchDefault}
								onchange={(value) => {
									if (isRowDecision(value)) {
										matchDefault = value;
										overrides = {};
									}
								}}
								class="w-48"
							/>
						</div>
					{/if}

					<Tabs.Root value={filter} onValueChange={setFilter} class="gap-4">
						<Tabs.List>
							{#each FILTERS as entry (entry.value)}
								<Tabs.Trigger value={entry.value}>
									{entry.label}
									{#if entry.value !== 'all'}
										<span class="text-muted-foreground">{preview.counts[entry.value]}</span>
									{/if}
								</Tabs.Trigger>
							{/each}
						</Tabs.List>
					</Tabs.Root>

					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-12">Row</Table.Head>
								<Table.Head class="w-28">Status</Table.Head>
								{#each previewFields as field (field.name)}
									<Table.Head>{field.label}</Table.Head>
								{/each}
								<Table.Head class="min-w-56">Details</Table.Head>
								<Table.Head class="w-44">Action</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each visible as row (row.line)}
								{@const decision = decisionFor(row)}
								<Table.Row
									class={cn(
										(row.status === 'invalid' ||
											row.status === 'duplicate' ||
											decision === 'skip') &&
											'opacity-60'
									)}
								>
									<Table.Cell class="text-muted-foreground tabular-nums">{row.line}</Table.Cell>
									<Table.Cell><Import.RowStatus status={row.status} /></Table.Cell>
									{#each previewFields as field (field.name)}
										{@const invalid = row.errors.some((issue) => issue.field === field.name)}
										<Table.Cell
											class={cn('max-w-48 truncate', invalid && 'text-destructive font-medium')}
											title={row.values[field.name] || undefined}
										>
											{row.values[field.name] || '—'}
										</Table.Cell>
									{/each}
									<Table.Cell class="whitespace-normal">
										<Import.RowDetails {row} noun={previewTerms.noun} />
									</Table.Cell>
									<Table.Cell>
										{#if row.status === 'match'}
											<Combobox
												size="sm"
												ariaLabel={`Row ${row.line}: what to do`}
												options={MATCH_DECISIONS}
												value={decision}
												onchange={(value) => decide(row, value)}
												class="w-full"
											/>
										{:else if row.status === 'new'}
											<Combobox
												size="sm"
												ariaLabel={`Row ${row.line}: what to do`}
												options={NEW_DECISIONS}
												value={decision}
												onchange={(value) => decide(row, value)}
												class="w-full"
											/>
										{:else}
											<span class="text-muted-foreground text-sm">Not imported</span>
										{/if}
									</Table.Cell>
								</Table.Row>
							{:else}
								<Table.Row>
									<Table.Cell
										colspan={previewFields.length + 4}
										class="text-muted-foreground py-8 text-center"
									>
										No rows here.
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>

					{#if filtered.length > visible.length}
						<div class="flex justify-center">
							<Button variant="outline" size="sm" onclick={() => (shown += PAGE)}>
								Show {Math.min(PAGE, filtered.length - visible.length)} more of {filtered.length -
									visible.length}
							</Button>
						</div>
					{/if}
				</Card.Content>
				<Card.Footer class="flex-wrap justify-between gap-3">
					<p class="text-muted-foreground text-sm">
						{willCreate} to add, {willUpdate} to overwrite, {posted.length -
							willCreate -
							willUpdate}
						skipped; {preview.counts.invalid + preview.counts.duplicate} left out.
					</p>
					<Button type="submit" disabled={$committing || !canCommit}>
						{$committing
							? 'Importing…'
							: `Import ${willCreate + willUpdate} ${willCreate + willUpdate === 1 ? previewTerms.noun : previewTerms.plural}`}
					</Button>
				</Card.Footer>
			</Card.Root>
		</form>
	{/if}
</div>
