<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, children } = $props();
	let { session, supabase } = $derived(data);

	onMount(() => {
		const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
			// Only invalidate when the session actually changed (sign in/out or a
			// token refresh). Comparing expires_at avoids a re-run loop, because
			// the invalidation itself re-emits the current session.
			if (newSession?.expires_at !== session?.expires_at) {
				void invalidate('supabase:auth');
			}
		});
		return () => sub.subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
