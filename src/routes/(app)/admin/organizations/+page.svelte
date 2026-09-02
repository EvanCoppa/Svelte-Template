<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>Admin · Organizations</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Organizations</Card.Title>
		<Card.Description>
			Every tenant, personal organizations included. Open one to set its industry and plan, override
			features, and manage members.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Industry</Table.Head>
						<Table.Head>Plan</Table.Head>
						<Table.Head class="text-right">Members</Table.Head>
						<Table.Head></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.organizations as org (org.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{org.name}</Table.Cell>
							<Table.Cell>{org.industryName}</Table.Cell>
							<Table.Cell>{org.tierName}</Table.Cell>
							<Table.Cell class="text-right">{org.memberCount}</Table.Cell>
							<Table.Cell class="text-right">
								<Button href="/admin/organizations/{org.id}" variant="outline" size="sm">
									Manage
								</Button>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={5} class="text-muted-foreground text-center">
								No organizations yet.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Content>
</Card.Root>
