import type { LayoutServerLoad } from './$types';

// This is a layout server load function that runs on the server
// Data returned from this function is available to ALL pages and components
// in your application through the $page.data store
//
// This is the perfect place to:
// - Load global user data (authentication, preferences)
// - Fetch site-wide configuration
// - Query data that multiple pages need
// - Set up global state that persists across navigation
//
// The data returned here will be merged with page-specific load data

export const load: LayoutServerLoad = async ({ url, cookies, request }) => {
	// Example: You could load global user data here
	// const user = await getUserFromCookies(cookies);

	// Example: Load site-wide settings
	// const siteConfig = await getSiteConfig();

	// Example: Get current theme from cookies
	const theme = cookies.get('theme') ?? 'light';

	return {
		// This data will be available on every page via $page.data
		theme,
		currentPath: url.pathname,
		timestamp: new Date().toISOString()

		// Add your global data here:
		// user,
		// siteConfig,
		// navigation: await getNavigationItems(),
		// etc.
	};
};