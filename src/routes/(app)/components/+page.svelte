<script lang="ts">
	import {
		CopyButton,
		FloatingLabelInput,
		InlineValidation,
		LoadingButton,
		OtpInput,
		PasswordStrength,
		SegmentedControl,
		TagInput,
		type OtpStatus,
		type SegmentedOption
	} from '$lib/components/enhanced/index.js';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Combobox, optionsFromLabels } from '$lib/components/ui/combobox/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
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
	import {
		createColumnHelper,
		createTable,
		createTableState,
		renderComponent,
		renderSnippet,
		type RowSelectionState
	} from '@tanstack/svelte-table';
	import { createRawSnippet } from 'svelte';
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

	// Command — the raw list-filtering primitive Combobox is built on.
	const COMMAND_FRUITS = ['Apple', 'Banana', 'Cherry', 'Grape', 'Mango', 'Peach'];
	let commandPick = $state('');

	let acceptTerms = $state(false);
	let notifications = $state(true);
	let dialogOpen = $state(false);
	let popoverOpen = $state(false);
	let sheetOpen = $state(false);

	const invoices = [
		{ id: 'INV-001', status: 'Paid', method: 'Credit card', amount: '$250.00' },
		{ id: 'INV-002', status: 'Pending', method: 'PayPal', amount: '$150.00' },
		{ id: 'INV-003', status: 'Unpaid', method: 'Bank transfer', amount: '$350.00' }
	];

	// Data table — the page owns the rows, the columns and the table instance;
	// the DataTable parts only render it.
	type Payment = {
		id: string;
		email: string;
		status: 'Paid' | 'Pending' | 'Refunded';
		amount: number;
	};

	const payments: Payment[] = [
		{ id: 'PAY-001', email: 'ken99@yahoo.com', status: 'Paid', amount: 316 },
		{ id: 'PAY-002', email: 'abe45@gmail.com', status: 'Paid', amount: 242 },
		{ id: 'PAY-003', email: 'monserrat44@gmail.com', status: 'Pending', amount: 837 },
		{ id: 'PAY-004', email: 'silas22@gmail.com', status: 'Paid', amount: 874 },
		{ id: 'PAY-005', email: 'carmella@hotmail.com', status: 'Refunded', amount: 721 },
		{ id: 'PAY-006', email: 'lulu.runolfsdottir@example.com', status: 'Pending', amount: 129 },
		{ id: 'PAY-007', email: 'esteban.torp@example.com', status: 'Paid', amount: 458 },
		{ id: 'PAY-008', email: 'jailyn.walter@example.com', status: 'Paid', amount: 390 },
		{ id: 'PAY-009', email: 'ottilie.mertz@example.com', status: 'Refunded', amount: 65 },
		{ id: 'PAY-010', email: 'derick.koss@example.com', status: 'Pending', amount: 512 },
		{ id: 'PAY-011', email: 'name.mcglynn@example.com', status: 'Paid', amount: 283 },
		{ id: 'PAY-012', email: 'wilber.veum@example.com', status: 'Paid', amount: 947 }
	];

	const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const amountCell = createRawSnippet<[{ amount: number }]>((getAmount) => {
		const { amount } = getAmount();
		return {
			render: () => `<div class="font-medium tabular-nums">${usd.format(amount)}</div>`
		};
	});

	const paymentColumnHelper = createColumnHelper<DataTable.DataTableFeatures, Payment>();

	const paymentColumns = paymentColumnHelper.columns([
		paymentColumnHelper.display({
			id: 'select',
			header: ({ table }) =>
				renderComponent(Checkbox, {
					checked: table.getIsAllPageRowsSelected(),
					indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
					onCheckedChange: (value: boolean) => table.toggleAllPageRowsSelected(!!value),
					'aria-label': 'Select all'
				}),
			cell: ({ row }) =>
				renderComponent(Checkbox, {
					checked: row.getIsSelected(),
					onCheckedChange: (value: boolean) => row.toggleSelected(!!value),
					'aria-label': 'Select row'
				}),
			enableSorting: false,
			enableHiding: false
		}),
		paymentColumnHelper.accessor('email', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Email' })
		}),
		paymentColumnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' })
		}),
		paymentColumnHelper.accessor('amount', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Amount' }),
			cell: ({ row }) => renderSnippet(amountCell, { amount: row.original.amount })
		})
	]);

	// Row selection lives outside the table so the page can read or reset it.
	const [paymentSelection, setPaymentSelection] = createTableState<RowSelectionState>({});

	const paymentsTable = createTable({
		features: DataTable.features,
		get data() {
			return payments;
		},
		columns: paymentColumns,
		initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
		state: {
			get rowSelection() {
				return paymentSelection();
			}
		},
		onRowSelectionChange: setPaymentSelection
	});

	const paymentEmailFilter = $derived(
		String(paymentsTable.getColumn('email')?.getFilterValue() ?? '')
	);

	// Segmented control — a radiogroup, so the value is a plain string.
	const ranges: SegmentedOption[] = [
		{ value: 'day', label: 'Day' },
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' },
		{ value: 'quarter', label: 'Quarter', disabled: true }
	];
	let range = $state('week');

	// Floating label.
	let workspace = $state('');
	let handle = $state('');
	const handleInvalid = $derived(handle.length > 0 && !/^[a-z0-9-]+$/.test(handle));

	// Inline validation — the validator returns the fault, or null when clean.
	let email = $state('');
	function validateEmail(value: string): string | null {
		if (value.length === 0) return 'An email is required';
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'That does not look like an email';
		return null;
	}

	// OTP — 123456 is the code that passes, anything else is rejected.
	let code = $state('');
	let codeStatus = $state<OtpStatus>('idle');

	function checkCode(value: string) {
		codeStatus = value === '123456' ? 'success' : 'error';
	}

	// Tag input.
	let skills = $state<string[]>(['Svelte', 'TypeScript']);

	// Password strength — paired with a plain ui/input, which still owns the field.
	let password = $state('');

	// Loading button — one that resolves, one that rejects.
	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	async function saveProfile() {
		await wait(1200);
	}

	async function failToSave() {
		await wait(1200);
		throw new Error('The server said no');
	}
</script>

<svelte:head>
	<title>Components</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Components</h1>
		<p class="text-muted-foreground">
			Every component this template ships: the shadcn-svelte primitives in
			<code>src/lib/components/ui/</code> and the motion-aware controls ported from Solid Core's
			<code>interior</code> collection in <code>src/lib/components/enhanced/</code>. Both are plain
			Svelte files in your repo — edit them, don't fight them. Where a job has two takes, they sit
			side by side so you can compare. Reach for <code>ui/</code> first; drop into
			<code>enhanced/</code> only when it has no answer for the job.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Buttons</h2>
		</div>

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
				<Card.Title>Action buttons (enhanced)</Card.Title>
				<Card.Description>
					<code>LoadingButton</code> owns its own pending/success/error state;
					<code>CopyButton</code> writes to the clipboard and draws its own checkmark.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<LoadingButton
					label="Save profile"
					pendingLabel="Saving…"
					successLabel="Saved"
					onAction={saveProfile}
				/>
				<LoadingButton
					label="Deploy"
					pendingLabel="Deploying…"
					errorLabel="Deploy failed"
					onAction={failToSave}
				/>
				<CopyButton value="sb_publishable_example_key" />
				<CopyButton value="npx shadcn-svelte@latest add button" label="Copy command" />
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Text fields</h2>
		</div>

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
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Floating label (enhanced)</Card.Title>
				<Card.Description>
					The label lifts into the notch on focus and stays up once there is a value — including a
					value the browser restores.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<FloatingLabelInput
					label="Workspace name"
					bind:value={workspace}
					maxlength={32}
					hint="Shown to everyone you invite."
					required
				/>
				<FloatingLabelInput
					label="URL handle"
					bind:value={handle}
					invalid={handleInvalid}
					hint={handleInvalid ? 'Lower case, digits and hyphens only.' : 'acme-industries'}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Inline validation (enhanced)</Card.Title>
				<Card.Description>
					Waits for the first blur, then settles instantly. A value that becomes correct clears
					immediately; a wrong one waits out the debounce, so it cannot flicker once per keystroke.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<InlineValidation
					label="Work email"
					type="email"
					placeholder="you@example.com"
					bind:value={email}
					validate={validateEmail}
					hint="We only use this for billing receipts."
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>One-time code (enhanced)</Card.Title>
				<Card.Description>
					Paste a full code into any cell and it fills from the first. Try <code>123456</code>;
					anything else is rejected.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<OtpInput
					bind:value={code}
					status={codeStatus}
					onValueChange={() => (codeStatus = 'idle')}
					onComplete={checkCode}
					errorMessage="That code is not right. Check your email."
					successMessage="Code accepted."
					hint="Six digits, from the email we just sent."
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Password strength (enhanced)</Card.Title>
				<Card.Description>
					A meter, not a gate, paired with a plain <code>ui/input</code> which still owns the field. Common
					passwords, four-character repeats and keyboard walks are capped at one segment however many
					rules they satisfy.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="grid gap-2">
					<Label for="demo-password">New password</Label>
					<Input
						id="demo-password"
						type="password"
						autocomplete="new-password"
						bind:value={password}
					/>
				</div>
				<PasswordStrength value={password} />
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Toggles</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Checkbox &amp; switch</Card.Title>
				<Card.Description
					>Binary choices — a checkbox for forms, a switch for settings.</Card.Description
				>
			</Card.Header>
			<Card.Content class="space-y-4">
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

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Pickers &amp; selection</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Select</Card.Title>
				<Card.Description>For short, static lists that don't need search.</Card.Description>
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
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Combobox</Card.Title>
				<Card.Description>
					Reach for this when the list is long enough to search, needs multi-select, or posts in a
					form — <code>name</code> makes it drop into a form action like a native select.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
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
				<Card.Title>Command</Card.Title>
				<Card.Description>
					The raw filterable-list primitive <code>Combobox</code> and the ⌘K palette are built on.
					Reach for it directly only when you need a bespoke layout — otherwise use
					<code>Combobox</code>.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Command.Root class="w-56 rounded-md border">
					<Command.Input placeholder="Search fruit…" />
					<Command.List>
						<Command.Empty>No fruit found.</Command.Empty>
						<Command.Group heading={commandPick ? `Picked ${commandPick}` : 'Fruit'}>
							{#each COMMAND_FRUITS as fruitName (fruitName)}
								<Command.Item onSelect={() => (commandPick = fruitName)}>
									{fruitName}
								</Command.Item>
							{/each}
						</Command.Group>
					</Command.List>
				</Command.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Segmented control (enhanced)</Card.Title>
				<Card.Description>
					A radiogroup with a sliding thumb, for a handful of mutually-exclusive options. Arrow keys
					move the selection and skip disabled segments. Chose <strong>{range}</strong>.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<SegmentedControl label="Report range" options={ranges} bind:value={range} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tag input (enhanced)</Card.Title>
				<Card.Description>
					Enter and comma commit, Backspace arms then removes, and a multi-value paste splits on the
					separators. Duplicates and the ceiling are refused with a reason.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<TagInput
					label="Skills"
					bind:value={skills}
					max={6}
					placeholder="Add a skill"
					hint="Enter adds · Backspace removes"
				/>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Badges &amp; avatars</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Badges &amp; Avatars</Card.Title>
				<Card.Description>Status markers, identity, and loading placeholders.</Card.Description>
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

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Overlays</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Dialog, menu &amp; tooltip</Card.Title>
				<Card.Description>A blocking modal, a floating menu, and a hover hint.</Card.Description>
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
				<Card.Title>Popover &amp; sheet</Card.Title>
				<Card.Description>
					A floating panel anchored to its trigger, and a panel that slides in from the edge of the
					screen — the sidebar uses <code>Sheet</code> for its mobile nav.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<Popover.Root bind:open={popoverOpen}>
					<Popover.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Open popover</Button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content class="space-y-2">
						<p class="text-sm font-medium">Anchored content</p>
						<p class="text-muted-foreground text-sm">
							Positioned relative to its trigger, flips to stay on screen.
						</p>
					</Popover.Content>
				</Popover.Root>

				<Sheet.Root bind:open={sheetOpen}>
					<Sheet.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Open sheet</Button>
						{/snippet}
					</Sheet.Trigger>
					<Sheet.Content>
						<Sheet.Header>
							<Sheet.Title>A side sheet</Sheet.Title>
							<Sheet.Description
								>Slides in from the edge; same overlay/focus trap as Dialog.</Sheet.Description
							>
						</Sheet.Header>
						<Sheet.Footer>
							<Button onclick={() => (sheetOpen = false)}>Done</Button>
						</Sheet.Footer>
					</Sheet.Content>
				</Sheet.Root>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Tabs</h2>
		</div>

		<Card.Root class="lg:col-span-2">
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

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Alerts &amp; toasts</h2>
		</div>

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
				The bare table primitives, for static rows. Once a grid needs sorting, filtering or
				pagination, reach for the <code>DataTable</code> compound below instead of wiring these by hand.
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

	<Card.Root>
		<Card.Header>
			<Card.Title>Data table</Card.Title>
			<Card.Description>
				The <code>DataTable</code> compound in <code>src/lib/components/data-table/</code>, built on
				<code>@tanstack/svelte-table</code> and the table primitives above. The page owns the rows,
				builds its columns with <code>createColumnHelper</code> and creates the table with
				<code>createTable</code> against the shared <code>DataTable.features</code> preset; the
				parts render it. The toolbar row here is page markup — search inputs and
				<code>ViewOptions</code> compose per page.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<DataTable.Root table={paymentsTable}>
				<div class="flex items-center gap-2">
					<Input
						placeholder="Filter emails…"
						value={paymentEmailFilter}
						oninput={(e) => paymentsTable.getColumn('email')?.setFilterValue(e.currentTarget.value)}
						class="max-w-sm"
					/>
					<DataTable.ViewOptions class="ms-auto" />
				</div>
				<DataTable.Content />
				<DataTable.Pagination pageSizeOptions={[5, 10, 20, 30, 50]} />
			</DataTable.Root>
		</Card.Content>
	</Card.Root>

	<Separator />
	<p class="text-muted-foreground pb-4 text-sm">
		Need a shadcn primitive not shown here? Add it with
		<code>npx shadcn-svelte@latest add &lt;component&gt;</code> — it lands in
		<code>src/lib/components/ui/</code> as editable source, same as these. Need a richer,
		motion-aware control? Port it from Solid Core's <code>src/lib/primitives/interior/</code> into
		<code>src/lib/components/enhanced/</code>, point its imports at <code>$lib/utils.js</code> and
		<code>$lib/motion.js</code>, add the two export lines, and give it a card here.
	</p>
</div>
