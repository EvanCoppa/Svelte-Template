<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Combobox, optionsFromLabels } from '$lib/components/ui/combobox/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import InfoIcon from '@lucide/svelte/icons/info';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';

	// Select (bits-ui) works with plain string values.
	const FRUIT_LABELS = {
		apple: 'Apple',
		banana: 'Banana',
		cherry: 'Cherry',
		grape: 'Grape'
	} satisfies Record<string, string>;
	const FRUIT_OPTIONS = Object.entries(FRUIT_LABELS);
	let fruit = $state('');
	let fruitLabel = $derived(
		FRUIT_OPTIONS.find(([value]) => value === fruit)?.[1] ?? 'Pick a fruit'
	);

	// Combobox — the searchable picker this codebase prefers over raw selects.
	const ROLE_LABELS = {
		admin: 'Administrator',
		editor: 'Editor',
		viewer: 'Viewer',
		billing: 'Billing manager'
	} satisfies Record<string, string>;
	let role = $state('');
	let tags = $state<string[]>([]);
	const tagOptions = ['Design', 'Engineering', 'Marketing', 'Sales', 'Support'];

	let acceptTerms = $state(false);
	let notifications = $state(true);
	let dialogOpen = $state(false);

	const invoices = [
		{ id: 'INV-001', status: 'Paid', method: 'Credit card', amount: '$250.00' },
		{ id: 'INV-002', status: 'Pending', method: 'PayPal', amount: '$150.00' },
		{ id: 'INV-003', status: 'Unpaid', method: 'Bank transfer', amount: '$350.00' }
	];
</script>

<svelte:head>
	<title>Components</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Components</h1>
		<p class="text-muted-foreground">
			The shadcn-svelte primitives vendored in <code>src/lib/components/ui/</code>. They are plain
			Svelte files in your repo — edit them, don't fight them.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Buttons</Card.Title>
				<Card.Description>Every variant and size, one component.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex flex-wrap items-center gap-2">
					<Button>Default</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="outline">Outline</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="destructive">Destructive</Button>
					<Button variant="link">Link</Button>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button size="sm">Small</Button>
					<Button size="default">Default</Button>
					<Button size="lg">Large</Button>
					<Button size="icon" aria-label="Add"><PlusIcon /></Button>
					<Button disabled>Disabled</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Badges &amp; Avatars</Card.Title>
				<Card.Description>Status markers and identity.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex flex-wrap items-center gap-2">
					<Badge>Default</Badge>
					<Badge variant="secondary">Secondary</Badge>
					<Badge variant="outline">Outline</Badge>
					<Badge variant="destructive">Destructive</Badge>
				</div>
				<div class="flex items-center gap-3">
					<Avatar.Root>
						<Avatar.Image src="https://github.com/ghost.png" alt="Avatar" />
						<Avatar.Fallback>GH</Avatar.Fallback>
					</Avatar.Root>
					<Avatar.Root>
						<Avatar.Fallback>AB</Avatar.Fallback>
					</Avatar.Root>
					<Skeleton class="size-10 rounded-full" />
					<div class="space-y-2">
						<Skeleton class="h-3 w-32" />
						<Skeleton class="h-3 w-24" />
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Form inputs</Card.Title>
				<Card.Description>
					Pair every input with a <code>Label</code> via <code>for</code>/<code>id</code>.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid gap-2">
					<Label for="demo-email">Email</Label>
					<Input id="demo-email" type="email" placeholder="you@example.com" />
				</div>
				<div class="grid gap-2">
					<Label for="demo-message">Message</Label>
					<Textarea id="demo-message" placeholder="Say something nice…" />
				</div>
				<div class="flex items-center gap-2">
					<Checkbox id="demo-terms" bind:checked={acceptTerms} />
					<Label for="demo-terms" class="font-normal">
						Accept terms {acceptTerms ? '✓' : ''}
					</Label>
				</div>
				<div class="flex items-center gap-2">
					<Switch id="demo-notifications" bind:checked={notifications} />
					<Label for="demo-notifications" class="font-normal">
						Email notifications {notifications ? 'on' : 'off'}
					</Label>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Pickers</Card.Title>
				<Card.Description>
					<code>Select</code> for short static lists; <code>Combobox</code> when the list is long enough
					to search, needs multi-select, or posts in a form.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid gap-2">
					<Label>Select — {fruit ? `chose ${fruitLabel}` : 'nothing chosen'}</Label>
					<Select.Root type="single" bind:value={fruit}>
						<Select.Trigger class="w-56">{fruitLabel}</Select.Trigger>
						<Select.Content>
							{#each FRUIT_OPTIONS as [value, label] (value)}
								<Select.Item {value} {label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid gap-2">
					<Label>Combobox (single, searchable)</Label>
					<Combobox
						bind:value={role}
						options={optionsFromLabels(ROLE_LABELS)}
						placeholder="Assign a role…"
						searchThreshold={0}
						clearable
						class="w-56"
					/>
				</div>
				<div class="grid gap-2">
					<Label>Combobox (multiple) — {tags.length} selected</Label>
					<Combobox
						multiple
						bind:selected={tags}
						options={tagOptions}
						placeholder="Pick teams…"
						class="w-56"
					/>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Overlays</Card.Title>
				<Card.Description>Dialog, dropdown menu, and tooltip.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<Dialog.Root bind:open={dialogOpen}>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Open dialog</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>A modal dialog</Dialog.Title>
							<Dialog.Description>
								Focus is trapped, Escape closes it, and the page behind is inert.
							</Dialog.Description>
						</Dialog.Header>
						<Dialog.Footer>
							<Button onclick={() => (dialogOpen = false)}>Done</Button>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>
								Menu <ChevronDownIcon class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start">
						<DropdownMenu.Label>Actions</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
						<DropdownMenu.Item>Archive</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item variant="destructive">Delete</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" {...props}>Hover me</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>A helpful hint.</Tooltip.Content>
				</Tooltip.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tabs</Card.Title>
				<Card.Description>Switch between related views without navigation.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Tabs.Root value="overview">
					<Tabs.List>
						<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
						<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
						<Tabs.Trigger value="danger">Danger zone</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="overview" class="text-muted-foreground pt-3 text-sm">
						The calm before the storm. Nothing to see here.
					</Tabs.Content>
					<Tabs.Content value="activity" class="text-muted-foreground pt-3 text-sm">
						You deployed to production on a Friday. Bold.
					</Tabs.Content>
					<Tabs.Content value="danger" class="text-muted-foreground pt-3 text-sm">
						Buttons in here should be <Badge variant="destructive">destructive</Badge> and confirmed with
						a dialog.
					</Tabs.Content>
				</Tabs.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Alerts</Card.Title>
				<Card.Description>
					Inline messages. Validation failures render through <code>FormAlert</code> — one line per form,
					nothing hand-rolled.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<Alert.Root>
					<InfoIcon />
					<Alert.Title>Heads up</Alert.Title>
					<Alert.Description>Neutral context that isn't tied to a submission.</Alert.Description>
				</Alert.Root>
				<Alert.Root variant="destructive">
					<CircleAlertIcon />
					<Alert.Title>Couldn't save</Alert.Title>
					<Alert.Description>Check the highlighted fields and try again.</Alert.Description>
				</Alert.Root>
				<Alert.Root variant="success">
					<CircleCheckIcon />
					<Alert.Title>Password updated</Alert.Title>
					<Alert.Description>Sign in with your new password.</Alert.Description>
				</Alert.Root>
				<Alert.FormAlert class="mb-0" message="Display name must be 100 characters or fewer." />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Toasts</Card.Title>
				<Card.Description>
					svelte-sonner via <code>ui/sonner</code>. House convention: successes toast, validation
					errors render inline next to the form.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<Button variant="outline" onclick={() => toast('A plain message')}>Default</Button>
				<Button variant="outline" onclick={() => toast.success('Changes saved')}>Success</Button>
				<Button variant="outline" onclick={() => toast.error('Something went wrong')}>Error</Button>
				<Button
					variant="outline"
					onclick={() =>
						toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
							loading: 'Saving…',
							success: 'Done',
							error: 'Failed'
						})}
				>
					Promise
				</Button>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Table</Card.Title>
			<Card.Description>
				For data grids with sorting/pagination, build on these primitives per page — resist a
				universal table abstraction until you truly need one.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-28">Invoice</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Method</Table.Head>
						<Table.Head class="text-right">Amount</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each invoices as invoice (invoice.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{invoice.id}</Table.Cell>
							<Table.Cell>
								<Badge variant={invoice.status === 'Paid' ? 'secondary' : 'outline'}>
									{invoice.status}
								</Badge>
							</Table.Cell>
							<Table.Cell>{invoice.method}</Table.Cell>
							<Table.Cell class="text-right">{invoice.amount}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<Separator />
	<p class="text-muted-foreground pb-4 text-sm">
		Need something not shown here? Add it with
		<code>npx shadcn-svelte@latest add &lt;component&gt;</code> — it lands in
		<code>src/lib/components/ui/</code> as editable source, same as these.
	</p>
</div>
