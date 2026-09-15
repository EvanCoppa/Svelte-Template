import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// src/** is the app. tools/** is the lint rules the app is held to —
		// they run in the same suite because a rule that has stopped firing is
		// as broken as a helper that has stopped working.
		include: ['src/**/*.{test,spec}.ts', 'tools/**/*.{test,spec}.js'],
		exclude: ['node_modules/**', '.svelte-kit/**'],
		// Server-side tests only for now. If you add component tests, install
		// @testing-library/svelte and switch to environment 'jsdom'.
		environment: 'node',
		globals: true
	}
});
