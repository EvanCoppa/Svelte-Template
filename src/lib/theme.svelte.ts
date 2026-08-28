import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

function createTheme() {
	let current = $state<Theme>('dark');

	if (browser) {
		const stored = localStorage.getItem('theme') as Theme | null;
		if (stored === 'light' || stored === 'dark') {
			current = stored;
		} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
			current = 'light';
		}
		applyTheme(current);
	}

	function applyTheme(theme: Theme) {
		if (!browser) return;
		document.documentElement.classList.toggle('dark', theme === 'dark');
		localStorage.setItem('theme', theme);
	}

	return {
		get current() {
			return current;
		},
		toggle() {
			current = current === 'dark' ? 'light' : 'dark';
			applyTheme(current);
		}
	};
}

export const theme = createTheme();
