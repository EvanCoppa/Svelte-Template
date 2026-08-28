import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Deploys to Vercel. Swap for another adapter if you host elsewhere:
		// https://svelte.dev/docs/kit/adapters
		adapter: adapter()
	}
};

export default config;
