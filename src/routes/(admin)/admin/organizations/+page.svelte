<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { adminOrganizationHref } from '$lib/admin/nav';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import type { AdminOrganization } from '$lib/server/admin/organizations';

	let { data } = $props();

	/**
	 * Plain English column headings and a plain English noun in the readout:
	 * the platform area has no industry, so nothing here is renamed by one.
	 * An organization is an organization to an operator, whatever the org
	 * itself calls its own records.
	 */
	const mediumDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, AdminOrganization>();
	const columns = columnHelper.columns([
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), adminOrganizationHref(row.original.id))
		}),
		columnHelper.accessor('industryName', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Industry' })
		}),
		columnHelper.accessor('tierName', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Tier' })
		}),
		columnHelper.accessor('memberCount', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Members' })
		}),
		columnHelper.accessor('createdAt', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Created' }),
			cell: ({ getValue }) => mediumDate.format(new Date(getValue()))
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.organizations;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="organization" />
	</DataTable.Root>
</div>
