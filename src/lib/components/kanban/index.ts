import Card from './kanban-card.svelte';
import CardFooter from './kanban-card-footer.svelte';
import CardHeader from './kanban-card-header.svelte';
import CardTitle from './kanban-card-title.svelte';
import Cards from './kanban-cards.svelte';
import Column from './kanban-column.svelte';
import ColumnHeader from './kanban-column-header.svelte';
import DropZone from './kanban-drop-zone.svelte';
import Empty from './kanban-empty.svelte';
import Ring from './kanban-ring.svelte';
import Root from './kanban.svelte';
import Zones from './kanban-zones.svelte';

export type { KanbanMove, KanbanStatus } from './context.svelte.js';
export type { KanbanRingFill } from './kanban-ring.svelte';

/**
 * A board of columns you can move a card between, on two axes: the **column**
 * is a status group — the coarse state a reader scans for — and the
 * **statuses** under it are the states a record is actually in. A column that
 * holds one status takes a release straight away; a column that holds several
 * splits into `Kanban.Zones` while a card is over it and asks which:
 *
 *   <Kanban.Root onmove={(id, status) => move(id, status)}>
 *     {#each groups as group (group.id)}
 *       <Kanban.Column value={group.id} label={group.label} statuses={group.statuses}>
 *         <Kanban.ColumnHeader tone={group.tone} count={group.cards.length}>
 *           {group.label}
 *         </Kanban.ColumnHeader>
 *         <Kanban.Zones>
 *           {#each group.statuses as status (status.value)}
 *             <Kanban.DropZone status={status.value} tone={toneOf(status)}>
 *               {status.label}
 *             </Kanban.DropZone>
 *           {/each}
 *         </Kanban.Zones>
 *         <Kanban.Cards>
 *           {#each group.cards as card (card.id)}
 *             <Kanban.Card id={card.id} status={card.status} label={card.title}>
 *               …whatever the record is…
 *             </Kanban.Card>
 *           {:else}
 *             <Kanban.Empty>Nothing here</Kanban.Empty>
 *           {/each}
 *         </Kanban.Cards>
 *       </Kanban.Column>
 *     {/each}
 *   </Kanban.Root>
 *
 * The page owns the groups, the statuses, the cards and what a move means —
 * the board knows only which card is in the air and which status it is over,
 * and hands those two back to `onmove`. A group's id never reaches `onmove`:
 * what a move writes is always a status, because a group is a way of reading
 * the board rather than a state a record can be in.
 *
 * Moving a card works from the keyboard as well as under a pointer: space
 * picks the focused card up, the left and right arrows move it one status at a
 * time — across column boundaries, so every status is reachable both ways —
 * and escape puts it down. The two paths call the same `onmove`.
 */
export {
	Root,
	Column,
	ColumnHeader,
	Zones,
	DropZone,
	Cards,
	Card,
	CardHeader,
	CardTitle,
	CardFooter,
	Ring,
	Empty,
	//
	Root as Kanban,
	Column as KanbanColumn,
	ColumnHeader as KanbanColumnHeader,
	Zones as KanbanZones,
	DropZone as KanbanDropZone,
	Cards as KanbanCards,
	Card as KanbanCard,
	CardHeader as KanbanCardHeader,
	CardTitle as KanbanCardTitle,
	CardFooter as KanbanCardFooter,
	Ring as KanbanRing,
	Empty as KanbanEmpty
};
