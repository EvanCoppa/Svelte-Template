import Actions from './context-panel-actions.svelte';
import Header from './context-panel-header.svelte';
import Body from './context-panel-body.svelte';
import Item from './context-panel-item.svelte';
import Section from './context-panel-section.svelte';
import Title from './context-panel-title.svelte';
import Root from './context-panel.svelte';

/**
 * A panel of context docked beside the thing it is about: `Root` is the card,
 * `Header` its one-line top holding a `Title` and its `Actions`, `Body` the
 * scrolling remainder, and `Section` / `Item` the rows most panels turn out to
 * want. What it shows is the page's — the panel is the frame.
 */
export {
	Root,
	Header,
	Title,
	Actions,
	Body,
	Section,
	Item,
	//
	Root as ContextPanel,
	Header as ContextPanelHeader,
	Title as ContextPanelTitle,
	Actions as ContextPanelActions,
	Body as ContextPanelBody,
	Section as ContextPanelSection,
	Item as ContextPanelItem
};
