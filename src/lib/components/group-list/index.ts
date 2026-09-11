import Empty from './group-list-empty.svelte';
import Group from './group-list-group.svelte';
import Header from './group-list-header.svelte';
import Item from './group-list-item.svelte';
import ItemMeta from './group-list-item-meta.svelte';
import ItemTitle from './group-list-item-title.svelte';
import Items from './group-list-items.svelte';
import Root from './group-list.svelte';

/**
 * A list that comes in headings, each of which opens and shuts:
 *
 *   <GroupList.Root>
 *     {#each groups as group (group.id)}
 *       <GroupList.Group>
 *         <GroupList.Header tone={group.tone} count="{group.rows.length} tasks">
 *           {group.label}
 *         </GroupList.Header>
 *         <GroupList.Items>
 *           {#each group.rows as row (row.id)}
 *             <GroupList.Item>
 *               {#snippet lead()}<Checkbox … />{/snippet}
 *               <GroupList.ItemTitle href={recordHref('task', row.id)}>
 *                 {row.title}
 *               </GroupList.ItemTitle>
 *               <GroupList.ItemMeta>…</GroupList.ItemMeta>
 *             </GroupList.Item>
 *           {/each}
 *         </GroupList.Items>
 *       </GroupList.Group>
 *     {/each}
 *   </GroupList.Root>
 *
 * Structural, with one piece of state: whether a group is open, which is the
 * collapsible's and bindable from the page. Nothing here groups, sorts, counts
 * or names anything — the page arrives with its rows already in piles, because
 * what a pile means (a due-date bucket on /tasks, a category on /notes) and
 * what it is called are the page's to know.
 */
export {
	Root,
	Group,
	Header,
	Items,
	Item,
	ItemTitle,
	ItemMeta,
	Empty,
	//
	Root as GroupList,
	Group as GroupListGroup,
	Header as GroupListHeader,
	Items as GroupListItems,
	Item as GroupListItem,
	ItemTitle as GroupListItemTitle,
	ItemMeta as GroupListItemMeta,
	Empty as GroupListEmpty
};
