import Actions from './page-header-actions.svelte';
import Root from './page-header.svelte';
import Title from './page-header-title.svelte';

/**
 * The heading line every `(app)` screen opens with:
 *
 *   <PageHeader.Root>
 *     <PageHeader.Title>Companies</PageHeader.Title>
 *     <PageHeader.Actions><CreateRecord … /></PageHeader.Actions>
 *   </PageHeader.Root>
 *
 * Structural only — three styled elements the page composes and fills. It has
 * no subtitle part: the name of a page is its `pages` row, said once.
 */
export {
	Root,
	Title,
	Actions,
	//
	Root as PageHeader,
	Title as PageHeaderTitle,
	Actions as PageHeaderActions
};
