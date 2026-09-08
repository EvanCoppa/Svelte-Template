<script lang="ts">
	import type { FieldValue } from '$lib/server/crm/records';

	/**
	 * One field's value, drawn the way its type says — the record page never
	 * inspects a value to decide how to show it (see `$lib/server/crm/records`).
	 */
	let {
		value,
		people = new Map()
	}: {
		value: FieldValue;
		/** Who each user id is, for `person` values; the page resolved them once. */
		people?: ReadonlyMap<string, string>;
	} = $props();

	// A fixed locale keeps the server render and the hydrated render identical
	// (see the staff page); the list pages format the same way. A `date`
	// column has no time zone, so it is read as the calendar day it names
	// rather than shifted into the viewer's zone.
	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
	const datetime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
	const number = new Intl.NumberFormat('en-US');

	function money(amount: number, currency: string): string {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
	}

	/** A website opens in a new tab; a mailto or tel hands off to another app in this one. */
	function external(href: string): boolean {
		return /^https?:\/\//i.test(href);
	}
</script>

{#if value.type === 'empty'}
	<span class="text-muted-foreground">—</span>
{:else if value.type === 'text'}
	<span class="whitespace-pre-line">{value.value}</span>
{:else if value.type === 'number'}
	<span class="tabular-nums">{number.format(value.value)}</span>
{:else if value.type === 'money'}
	<span class="tabular-nums">
		{money(value.value, value.currency)}{#if value.unit}<span class="text-muted-foreground">
				/ {value.unit}</span
			>{/if}
	</span>
{:else if value.type === 'boolean'}
	{value.value ? 'Yes' : 'No'}
{:else if value.type === 'date'}
	<time datetime={value.value}>{date.format(new Date(value.value))}</time>
{:else if value.type === 'datetime'}
	<time datetime={value.value}>{datetime.format(new Date(value.value))}</time>
{:else if value.type === 'link'}
	<a
		href={value.href}
		class="underline-offset-4 hover:underline"
		target={external(value.href) ? '_blank' : undefined}
		rel={external(value.href) ? 'noreferrer' : undefined}
	>
		{value.value}
	</a>
{:else if value.type === 'record'}
	{#if value.href}
		<a href={value.href} class="font-medium underline-offset-4 hover:underline">{value.value}</a>
	{:else}
		{value.value}
	{/if}
{:else if value.type === 'person'}
	{people.get(value.userId) ?? 'Former member'}
{/if}
