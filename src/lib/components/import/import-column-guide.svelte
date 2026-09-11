<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { fieldAliases, fieldFormat } from '$lib/imports';
	import {
		IMPORT_SPECS,
		importFields,
		requiredFields,
		type ImportKind
	} from '$lib/schemas/imports';

	/**
	 * What a kind's file may contain: one row per field the record form asks
	 * for, with whether it is required, the shape a cell must have and the
	 * other header names the column is recognised under. Read off the
	 * registry, so a field added to the form appears here by itself.
	 */
	let { kind }: { kind: ImportKind } = $props();

	const fields = $derived(importFields(kind));
	const required = $derived(new Set(requiredFields(kind)));
	const key = $derived(IMPORT_SPECS[kind].key);
</script>

<Table.Root data-slot="import-column-guide">
	<Table.Header>
		<Table.Row>
			<Table.Head>Column</Table.Head>
			<Table.Head>Takes</Table.Head>
			<Table.Head>Also read as</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each fields as field (field.name)}
			<Table.Row>
				<Table.Cell class="align-top">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium">{field.label}</span>
						{#if required.has(field.name)}
							<StatusBadge tone="warning" dot={false} size="sm">Required</StatusBadge>
						{/if}
						{#if field.name === key}
							<StatusBadge tone="info" dot={false} size="sm">Matches existing rows</StatusBadge>
						{/if}
					</div>
				</Table.Cell>
				<Table.Cell class="text-muted-foreground align-top">{fieldFormat(field)}</Table.Cell>
				<Table.Cell class="text-muted-foreground align-top">
					{fieldAliases(kind, field).join(', ') || '—'}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
