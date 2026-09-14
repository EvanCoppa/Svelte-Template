import Root from './whiteboard.svelte';
import Swatch from './whiteboard-swatch.svelte';
import Tool from './whiteboard-tool.svelte';
import Toolbar from './whiteboard-toolbar.svelte';

/**
 * The whiteboard, composed on the page that owns the board:
 *
 *   <Whiteboard.Toolbar>
 *     <Whiteboard.Tool label="Rectangle" active={tool === 'rect'} onclick={…}>…</Whiteboard.Tool>
 *     <Whiteboard.Swatch ink="red" label="Red" active={ink === 'red'} onclick={…} />
 *   </Whiteboard.Toolbar>
 *   <Whiteboard.Root {elements} {tool} {ink} {weight} {filled} bind:view oncommit={…} />
 *
 * `Root` is the canvas and the only part that knows a pointer; the toolbar is
 * three plain parts the page fills, so which tools exist, what they are
 * called and what each one does are all readable in the page's own markup.
 * The scene, the geometry and the `localStorage` board live in
 * `$lib/whiteboard/`.
 */
export {
	Root,
	Toolbar,
	Tool,
	Swatch,
	//
	Root as Whiteboard,
	Toolbar as WhiteboardToolbar,
	Tool as WhiteboardTool,
	Swatch as WhiteboardSwatch
};
