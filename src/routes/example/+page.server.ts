/*
	SvelteKit Server-Side File Explanation:

	+page.server.ts files run exclusively on the server and handle:
	- Server-side data loading (load function)
	- Form actions (actions object)
	- Server-only logic that shouldn't run in the browser

	File-based routing structure:
	src/routes/
	├── +layout.svelte          → Root layout for all pages
	├── +layout.server.ts       → Server-side layout logic
	├── +page.svelte           → Home page (/)
	├── about/
	│   └── +page.svelte       → About page (/about)
	└── example/               → This folder creates /example route
	    ├── +page.svelte       → Page component
	    └── +page.server.ts    → This file (server logic)
*/

import type { PageServerLoad, Actions } from './$types';

// Load function runs before the page renders
// Data returned here is available in the +page.svelte component
export const load: PageServerLoad = async () => {
	return {
		message: 'Welcome to the server action example!',
		timestamp: new Date().toISOString()
	};
};

// Actions handle form submissions and other POST requests
export const actions: Actions = {
	// This action is called when form submits to ?/getData
	getData: async ({ request }) => {
		// You can access form data like this:
		// const data = await request.formData();
		// const someField = data.get('fieldName');

		console.log('Server action called at:', new Date().toISOString());

		// Simulate some server-side work
		await new Promise(resolve => setTimeout(resolve, 500));

		// You could call database functions, APIs, etc. here
		// For example: await validateCredentials() from auth.server.ts

		const serverInfo = {
			timestamp: new Date().toISOString(),
			serverTime: new Date().toLocaleString(),
			routingExplanation: 'SvelteKit uses file-based routing: src/routes/example/+page.svelte creates /example URL. +page.server.ts handles server logic like this action.',
			userAgent: request.headers.get('user-agent')?.substring(0, 50) + '...'
		};

		// Return data to update the page
		return {
			message: 'Data retrieved from server successfully!',
			timestamp: serverInfo.serverTime,
			data: serverInfo
		};
	},

	// Example of another action you could add
	processForm: async ({ request }) => {
		const data = await request.formData();
		// Process form data here

		return {
			message: 'Form processed successfully!'
		};
	}
};