<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import Description from './alert-description.svelte';
	import Root, { type AlertVariant } from './alert.svelte';

	/**
	 * The one way this app renders a form's inline feedback — the other half of
	 * the mutation-feedback convention (successes toast, failures render inline).
	 *
	 *   <FormAlert message={form?.message} />
	 *
	 * Renders nothing when there is no message, so callers need no `{#if}`. The
	 * underlying Alert carries `role="alert"`, so a failure that arrives after
	 * submit is announced instead of silently appearing.
	 */
	let {
		ref = $bindable(null),
		class: className,
		message,
		variant = 'destructive',
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		ref?: HTMLDivElement | null;
		message?: string | null;
		variant?: AlertVariant;
	} = $props();
</script>

{#if message}
	<Root bind:ref {variant} class={cn('mb-4', className)} {...restProps}>
		<Description>{message}</Description>
	</Root>
{/if}
