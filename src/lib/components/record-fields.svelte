<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toLocalDateTimeInput } from '$lib/calendar';
	import { Button } from '$lib/components/ui/button/index.js';
	import CrosshairIcon from '@lucide/svelte/icons/crosshair';
	import { formatFix, parseFix } from '$lib/crm/visits';
	import {
		RECORD_FORMS,
		RECORD_PICKER_KINDS,
		type RecordField,
		type RecordFormValues,
		type RecordPickerKind,
		type RecordPickers,
		type RecordType
	} from '$lib/schemas/records';
	import { cn } from '$lib/utils.js';

	/**
	 * One input per field in the registry entry for `type` — the inside of the
	 * record form, and the reason there is only one of it.
	 *
	 * `CreateRecord` and `EditRecord` are the two frames around this: they
	 * differ in what the button says, where it posts and what happens after,
	 * and in nothing else. A field that renders differently in one of them
	 * would be a field that saves differently, so the loop lives here rather
	 * than in either.
	 *
	 * The whole `superForm` is the prop rather than its stores one by one:
	 * three stores in a row is three chances to pass the wrong one.
	 */
	let {
		type,
		superform,
		pickers = {},
		idPrefix
	}: {
		type: RecordType;
		superform: SuperForm<RecordFormValues>;
		/** The options behind each picker field, as the page's load read them. */
		pickers?: RecordPickers;
		/** Distinguishes these inputs' ids from another form's on the same page. */
		idPrefix: string;
	} = $props();

	const definition = RECORD_FORMS[type];
	const { form, errors, constraints } = superform;

	function fieldId(field: RecordField): string {
		return `${idPrefix}-${type}-${field.name}`;
	}

	/**
	 * A `type="number"` input hands the binding a number, or null once cleared;
	 * every field here is a string (the schema's rule), so the setter puts the
	 * text back — the way the proposal builder's function bindings do.
	 */
	function asText(value: string | number | null | undefined): string {
		return value === null || value === undefined ? '' : String(value);
	}

	/**
	 * What the input shows for what the form holds. The same string, for every
	 * field but one: an edit form's `datetime` value arrives as the INSTANT the
	 * column stores, and only the browser knows which wall clock that is
	 * (docs/calendar.md). Idempotent — a wall-clock value the reader typed
	 * passes straight through — and the submit rewrites it to an instant again.
	 */
	function shown(field: RecordField, value: string): string {
		return field.type === 'datetime' && value !== '' ? toLocalDateTimeInput(value) : value;
	}

	/**
	 * A field that picks one of the org's own rows — its options came with the
	 * form. Derived from `RECORD_PICKER_KINDS` rather than listed, so a kind
	 * added to the registry renders here without a second edit.
	 */
	function isPicker(field: RecordField): field is RecordField & { type: RecordPickerKind } {
		// SAFETY: widening a `readonly PickerKind[]` to `readonly string[]` so
		// `includes` accepts the broader field-type union. Widening only, and
		// the predicate's narrowing is what the return type asserts.
		return (RECORD_PICKER_KINDS as readonly string[]).includes(field.type);
	}

	/**
	 * What a captured fix reads as. The numbers are the device's, so they are
	 * shown rather than made typeable — `parseFix()` is the one reader, here
	 * and on the server.
	 */
	function fixLabel(value: string): string {
		const fix = parseFix(value);
		if (!fix) return 'No location captured';
		const point = `${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}`;
		return fix.accuracy === null ? point : `${point} (±${Math.round(fix.accuracy)}m)`;
	}

	/** Set while the device is being asked, so the button says what it is doing. */
	let locating = $state(false);
	let locationError = $state('');

	/**
	 * Ask the device where it is and put the answer in the field. A refusal is
	 * reported next to the button and nothing is written: a visit is worth
	 * keeping without a fix (the rule `parseFix()` states), so this never
	 * blocks the form.
	 */
	function capture(name: string) {
		if (!navigator.geolocation) {
			locationError = 'This browser cannot report a location.';
			return;
		}
		locating = true;
		locationError = '';
		navigator.geolocation.getCurrentPosition(
			(position) => {
				locating = false;
				$form[name] = formatFix({
					latitude: Number(position.coords.latitude.toFixed(6)),
					longitude: Number(position.coords.longitude.toFixed(6)),
					accuracy: Number.isFinite(position.coords.accuracy)
						? Number(position.coords.accuracy.toFixed(2))
						: null
				});
			},
			() => {
				locating = false;
				locationError = 'Could not read this device’s location.';
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}

	function inputType(field: RecordField) {
		switch (field.type) {
			case 'datetime':
				return 'datetime-local' as const;
			case 'email':
				return 'email' as const;
			case 'tel':
				return 'tel' as const;
			case 'url':
				return 'url' as const;
			case 'number':
			case 'integer':
				return 'number' as const;
			case 'date':
				return 'date' as const;
			default:
				return 'text' as const;
		}
	}
</script>

{#each definition.fields as field (field.name)}
	{@const id = fieldId(field)}
	{@const invalid = ($errors[field.name]?.length ?? 0) > 0}
	<div class={cn('grid gap-2', field.wide && 'sm:col-span-2')}>
		<Label for={id}>{field.label}</Label>

		{#if field.type === 'select'}
			<Combobox
				{id}
				name={field.name}
				bind:value={$form[field.name]}
				options={field.options ?? []}
				{invalid}
			/>
		{:else if isPicker(field)}
			<Combobox
				{id}
				name={field.name}
				bind:value={$form[field.name]}
				options={pickers[field.type] ?? []}
				placeholder="None"
				searchPlaceholder="Search by name…"
				clearable
				{invalid}
			/>
		{:else if field.type === 'geo'}
			<div class="flex flex-wrap items-center gap-2">
				<!-- The value posts through a hidden input, exactly as a Combobox
				     does, so the field needs no JavaScript to submit what it holds. -->
				<input type="hidden" name={field.name} value={$form[field.name]} />
				<Button
					{id}
					type="button"
					variant="outline"
					size="sm"
					disabled={locating}
					onclick={() => capture(field.name)}
				>
					<CrosshairIcon />
					{locating ? 'Locating…' : 'Use my location'}
				</Button>
				<span class="text-muted-foreground text-sm">{fixLabel($form[field.name])}</span>
				{#if $form[field.name] !== ''}
					<Button type="button" variant="ghost" size="sm" onclick={() => ($form[field.name] = '')}>
						Clear
					</Button>
				{/if}
			</div>
			{#if locationError}
				<p class="text-muted-foreground text-sm">{locationError}</p>
			{/if}
		{:else if field.type === 'textarea'}
			<Textarea
				{id}
				name={field.name}
				placeholder={field.placeholder}
				aria-invalid={invalid ? 'true' : undefined}
				aria-describedby={invalid ? `${id}-error` : undefined}
				bind:value={$form[field.name]}
				{...$constraints[field.name] ?? {}}
			/>
		{:else}
			<Input
				{id}
				name={field.name}
				type={inputType(field)}
				placeholder={field.placeholder}
				step={field.type === 'number' ? '0.01' : field.type === 'integer' ? '1' : undefined}
				aria-invalid={invalid ? 'true' : undefined}
				aria-describedby={invalid ? `${id}-error` : undefined}
				bind:value={
					() => shown(field, $form[field.name]), (value) => ($form[field.name] = asText(value))
				}
				{...$constraints[field.name] ?? {}}
			/>
		{/if}

		{#if invalid}
			<p id="{id}-error" class="text-destructive text-sm">{$errors[field.name]}</p>
		{/if}
	</div>
{/each}
