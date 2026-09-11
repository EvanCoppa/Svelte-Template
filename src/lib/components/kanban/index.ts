import Card from './kanban-card.svelte';
import Column from './kanban-column.svelte';
import ColumnHeader from './kanban-column-header.svelte';
import Empty from './kanban-empty.svelte';
import Root from './kanban.svelte';

export type { KanbanMove } from './context.svelte.js';

/**
 * A board of columns you can move a card between:
 *
 *   <Kanban.Root onmove={(id, status) => move(id, status)}>
 *     {#each columns as column (column.value)}
 *       <Kanban.Column value={column.value} label={column.label}>
 *         <Kanban.ColumnHeader tone={column.tone} count={column.cards.length}>
 *           {column.label}
 *         </Kanban.ColumnHeader>
 *         {#each column.cards as card (card.id)}
 *           <Kanban.Card id={card.id} column={column.value} label={card.title}>
 *             …whatever the record is…
 *           </Kanban.Card>
 *         {:else}
 *           <Kanban.Empty>Nothing here</Kanban.Empty>
 *         {/each}
 *       </Kanban.Column>
 *     {/each}
 *   </Kanban.Root>
 *
 * The page owns the columns, the cards and what a move means — the board knows
 * only which card is in the air and which column it is over, and hands those
 * two back to `onmove`. What a column's `value` stands for is the page's
 * business: a task status here, a deal stage or a pipeline elsewhere.
 *
 * Moving a card works from the keyboard as well as under a pointer: space
 * picks the focused card up, the left and right arrows move it a column at a
 * time, escape puts it down. The two paths call the same `onmove`.
 */
export {
	Root,
	Column,
	ColumnHeader,
	Card,
	Empty,
	//
	Root as Kanban,
	Column as KanbanColumn,
	ColumnHeader as KanbanColumnHeader,
	Card as KanbanCard,
	Empty as KanbanEmpty
};
