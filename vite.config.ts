import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	ssr: {
		// @tanstack/svelte-table ships extensionless `./createTable.svelte`
		// specifiers that only a Svelte-aware resolver can follow. Externalized
		// for SSR they reach Node's ESM loader, which fails them with
		// ERR_MODULE_NOT_FOUND; bundling keeps resolution inside Vite.
		noExternal: ['@tanstack/svelte-table']
	}
});
