<!--
	SvelteKit File-Based Routing Example

	This file demonstrates SvelteKit's file-based routing system:
	- Files in src/routes/ automatically become pages
	- +page.svelte creates a page component
	- The folder name becomes the URL path (/example in this case)
	- +page.server.ts handles server-side logic for this page
	- Forms with method="POST" automatically call server actions
-->

<script>
	import { enhance } from '$app/forms';

	// This data comes from the +page.server.ts load function
	export let data;
	// Form data comes from server actions
	export let form;
</script>

<div class="min-h-screen bg-gray-100 py-12 px-4">
	<div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
		<h1 class="text-2xl font-bold text-gray-800 mb-6">Server Action Example</h1>

		<p class="text-gray-600 mb-4">
			This page demonstrates SvelteKit's server actions. Click the button to send data to the server.
		</p>

		<!-- Display server data if available -->
		{#if data.message}
			<div class="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
				<p class="text-blue-800">{data.message}</p>
				{#if data.timestamp}
					<p class="text-blue-600 text-sm">Server time: {data.timestamp}</p>
				{/if}
			</div>
		{/if}

		<!-- Display action result if available -->
		{#if form?.message}
			<div class="bg-green-50 border border-green-200 rounded p-3 mb-4">
				<p class="text-green-800">{form.message}</p>
				{#if form.timestamp}
					<p class="text-green-600 text-sm">Action time: {form.timestamp}</p>
				{/if}
				{#if form.data}
					<div class="mt-2 text-sm text-green-700">
						<p class="font-medium">File-based routing:</p>
						<p class="italic">{form.data.routingExplanation}</p>
						<p class="mt-1">User agent: {form.data.userAgent}</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Form that calls server action -->
		<form method="POST" action="?/getData" use:enhance>
			<button
				type="submit"
				class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
			>
				Get Server Information
			</button>
		</form>

		<div class="mt-6 p-4 bg-gray-50 rounded-lg">
			<h3 class="font-semibold text-gray-700 mb-2">How this works:</h3>
			<ul class="text-sm text-gray-600 space-y-1">
				<li>• The button triggers a POST request to the "getData" action</li>
				<li>• The server action runs in +page.server.ts</li>
				<li>• Data is processed server-side and returned to the page</li>
				<li>• The page re-renders with the new data</li>
			</ul>
		</div>

		<div class="mt-4">
			<a
				href="/"
				class="text-blue-600 hover:text-blue-800 text-sm underline"
			>
				← Back to home
			</a>
		</div>
	</div>
</div>