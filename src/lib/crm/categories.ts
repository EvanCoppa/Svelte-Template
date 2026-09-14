/**
 * The catalog tree, folded — the one place `parent_id` becomes a shape.
 *
 * `listProductCategories()` reads every node flat with its own product count,
 * because PostgREST cannot embed a self-referencing composite key and a tree
 * drawn node by node is a query per node. Everything that is a question about
 * the TREE rather than about a row is answered here, once, so the categories
 * page and a single category's page never disagree about what is under what.
 *
 * Client-safe: pure functions over rows, no `$lib/server` import.
 */

/** The shape these take: a row with a parent and its own direct product count. */
export type CategoryNode = {
	id: string;
	parent_id: string | null;
	name: string;
	description: string | null;
	sort_order: number;
	/** The count embed PostgREST returns: one row, or none when nothing is filed. */
	products: { count: number }[];
};

/** One node with its subtree, and what the subtree adds up to. */
export type CategoryTreeNode<T extends CategoryNode> = {
	category: T;
	/** How deep it sits: a root is 0. */
	depth: number;
	children: CategoryTreeNode<T>[];
	/** Products filed directly in this category. */
	ownProducts: number;
	/** Products anywhere in this category or under it — what a reader means by "in Materials". */
	totalProducts: number;
};

/** Products filed directly in a category; a row with no embed reads as none. */
export function ownProductCount(category: CategoryNode): number {
	return category.products[0]?.count ?? 0;
}

/**
 * The flat rows as a tree, siblings in the order they arrived (the query
 * orders by `sort_order` then name).
 *
 * A node whose parent is not in the list becomes a root rather than
 * disappearing: RLS returns whole orgs, so that should not happen — but a
 * category silently vanishing from the page is a worse failure than one shown
 * at the wrong depth, and a cycle the database's trigger somehow let through
 * would otherwise hang the walk.
 */
export function categoryTree<T extends CategoryNode>(
	categories: readonly T[]
): CategoryTreeNode<T>[] {
	const byParent = new Map<string | null, T[]>();
	const ids = new Set(categories.map((category) => category.id));
	for (const category of categories) {
		// A parent that is not in the list is no parent: the node becomes a root
		// rather than disappearing.
		const parent =
			category.parent_id !== null && ids.has(category.parent_id) ? category.parent_id : null;
		const siblings = byParent.get(parent);
		if (siblings) siblings.push(category);
		else byParent.set(parent, [category]);
	}

	// `placed` is the cycle guard: a node already in the tree is never placed
	// again, so a parent chain that loops ends instead of recursing forever.
	const placed = new Set<string>();
	const build = (parentId: string | null, depth: number): CategoryTreeNode<T>[] =>
		(byParent.get(parentId) ?? [])
			.filter((category) => !placed.has(category.id))
			.map((category) => {
				placed.add(category.id);
				const children = build(category.id, depth + 1);
				const ownProducts = ownProductCount(category);
				return {
					category,
					depth,
					children,
					ownProducts,
					totalProducts: ownProducts + children.reduce((sum, child) => sum + child.totalProducts, 0)
				};
			});

	const roots = build(null, 0);
	// A cycle has no root, so the walk above never reaches it and the nodes
	// would vanish from the page entirely. Whatever is left over is shown at
	// the top level: drawn at the wrong depth beats not drawn at all, and the
	// database's trigger is what stops a cycle existing in the first place.
	for (const category of categories) {
		if (placed.has(category.id)) continue;
		placed.add(category.id);
		const children = build(category.id, 1);
		const ownProducts = ownProductCount(category);
		roots.push({
			category,
			depth: 0,
			children,
			ownProducts,
			totalProducts: ownProducts + children.reduce((sum, child) => sum + child.totalProducts, 0)
		});
	}
	return roots;
}

/** The tree flattened back to rows in reading order, each carrying its depth. */
export function flattenTree<T extends CategoryNode>(
	nodes: readonly CategoryTreeNode<T>[]
): CategoryTreeNode<T>[] {
	return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/**
 * The path from the root down to one category, that category last — what a
 * page prints as "Materials › Fixings › Stainless".
 */
export function categoryPath<T extends CategoryNode>(
	categories: readonly T[],
	categoryId: string
): T[] {
	const byId = new Map(categories.map((category) => [category.id, category]));
	const path: T[] = [];
	const seen = new Set<string>();
	let current = byId.get(categoryId);
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		path.unshift(current);
		current = current.parent_id === null ? undefined : byId.get(current.parent_id);
	}
	return path;
}

/**
 * Every category that is this one or under it — the ids a "move" must refuse
 * as a new parent, since a category cannot become its own ancestor. The
 * database's trigger is the backstop; this is what keeps the choice off the
 * picker in the first place.
 */
export function subtreeIds<T extends CategoryNode>(
	categories: readonly T[],
	categoryId: string
): Set<string> {
	const byParent = new Map<string, T[]>();
	for (const category of categories) {
		if (category.parent_id === null) continue;
		const siblings = byParent.get(category.parent_id);
		if (siblings) siblings.push(category);
		else byParent.set(category.parent_id, [category]);
	}
	const ids = new Set<string>();
	const walk = (id: string) => {
		if (ids.has(id)) return;
		ids.add(id);
		for (const child of byParent.get(id) ?? []) walk(child.id);
	};
	walk(categoryId);
	return ids;
}
