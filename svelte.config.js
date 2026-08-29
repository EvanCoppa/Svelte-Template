import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Deploys to Vercel. Swap for another adapter if you host elsewhere:
		// https://svelte.dev/docs/kit/adapters
		adapter: adapter(),

		typescript: {
			// The generated tsconfig only covers `src/`, which would leave the
			// Playwright suite and its config unchecked by `npm run check`.
			// Extending the generated `include` is the supported way to widen it
			// without copying SvelteKit's list into tsconfig.json by hand.
			config(config) {
				config.include.push('../e2e/**/*.ts', '../playwright.config.ts');
				return config;
			}
		}
	}
};

export default config;
