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
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';

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
	<title>Enhanced primitives</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Enhanced primitives</h1>
		<p class="text-muted-foreground">
			Motion-aware controls in <code>src/lib/components/enhanced/</code>, ported from Solid Core's
			<code>interior</code> collection. They sit alongside
			<code>src/lib/components/ui/</code> rather than replacing it — reach for
			<code>ui/</code> first, and come here when the job needs something it has no answer for.
			Everything below paints from the tokens in <code>src/app.css</code>, so flip the theme in the
			header and it follows.
		</p>
	</div>

	<div class="grid items-start gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Segmented control</Card.Title>
				<Card.Description>
					A radiogroup with a sliding thumb. Arrow keys move the selection and skip disabled
					segments. Chose <strong>{range}</strong>.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<SegmentedControl label="Report range" options={ranges} bind:value={range} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Floating label</Card.Title>
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
				<Card.Title>Inline validation</Card.Title>
				<Card.Description>
					Waits for the first blur, then settles instantly. After that a value that becomes correct
					clears immediately while a wrong one waits out the debounce, so it cannot flicker once per
					keystroke.
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
				<Card.Title>One-time code</Card.Title>
				<Card.Description>
					Paste a full code into any cell and it fills from the first. Try
					<code>123456</code>; anything else is rejected.
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
				<Card.Title>Tag input</Card.Title>
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

		<Card.Root>
			<Card.Header>
				<Card.Title>Password strength</Card.Title>
				<Card.Description>
					A meter, not a gate. Common passwords, four-character repeats and keyboard walks are
					capped at one segment however many rules they satisfy.
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

		<Card.Root>
			<Card.Header>
				<Card.Title>Loading button</Card.Title>
				<Card.Description>
					Owns its own pending, success and error states. A rejected promise settles into the error
					label and reverts on its own.
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
				<LoadingButton label="Disabled" onAction={saveProfile} disabled />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Copy button</Card.Title>
				<Card.Description>
					Writes to the clipboard, draws a tick along its own path, and falls back to a hidden
					textarea where the Clipboard API is unavailable.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<CopyButton value="sb_publishable_example_key" />
				<CopyButton value="npx shadcn-svelte@latest add button" label="Copy command" />
			</Card.Content>
		</Card.Root>
	</div>

	<Separator />
	<p class="text-muted-foreground pb-4 text-sm">
		Adding another? Port it from Solid Core's <code>src/lib/primitives/interior/</code> into its own
		folder here, point its imports at <code>$lib/utils.js</code> and
		<code>$lib/motion.js</code>, add the two export lines, and give it a card on this page.
	</p>
</div>
