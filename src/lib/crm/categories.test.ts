import { describe, expect, it } from 'vitest';
import {
	categoryPath,
	categoryTree,
	flattenTree,
	ownProductCount,
	subtreeIds,
	type CategoryNode
} from './categories';

function node(id: string, parent_id: string | null, name: string, count = 0): CategoryNode {
	return { id, parent_id, name, description: null, sort_order: 0, products: [{ count }] };
}

/**
 *   Materials (0)          Services (2)
 *     Fixings (1)
 *       Stainless (3)
 */
const CATALOG: CategoryNode[] = [
	node('materials', null, 'Materials'),
	node('fixings', 'materials', 'Fixings', 1),
	node('stainless', 'fixings', 'Stainless', 3),
	node('services', null, 'Services', 2)
];

describe('categoryTree', () => {
	it('nests the rows and keeps the order they arrived in', () => {
		const tree = categoryTree(CATALOG);
		expect(tree.map((n) => n.category.id)).toEqual(['materials', 'services']);
		expect(tree[0].children.map((n) => n.category.id)).toEqual(['fixings']);
		expect(tree[0].children[0].children.map((n) => n.category.id)).toEqual(['stainless']);
	});

	it('counts a subtree, not just the node', () => {
		const [materials, services] = categoryTree(CATALOG);
		// Materials holds nothing itself; Fixings has 1 and Stainless 3.
		expect(materials.ownProducts).toBe(0);
		expect(materials.totalProducts).toBe(4);
		expect(services.totalProducts).toBe(2);
	});

	it('carries the depth each node sits at', () => {
		expect(flattenTree(categoryTree(CATALOG)).map((n) => [n.category.id, n.depth])).toEqual([
			['materials', 0],
			['fixings', 1],
			['stainless', 2],
			['services', 0]
		]);
	});

	it('shows a node whose parent is missing rather than dropping it', () => {
		const orphan = [node('fixings', 'gone', 'Fixings', 1)];
		expect(categoryTree(orphan).map((n) => n.category.id)).toEqual(['fixings']);
	});

	it('ends on a cycle instead of recursing forever', () => {
		// The database's trigger refuses this; the fold must not hang if one
		// ever reaches it.
		const cycle = [node('a', 'b', 'A'), node('b', 'a', 'B')];
		expect(flattenTree(categoryTree(cycle))).toHaveLength(2);
	});

	it('reads a row with no count embed as no products', () => {
		expect(ownProductCount({ ...node('x', null, 'X'), products: [] })).toBe(0);
	});
});

describe('categoryPath', () => {
	it('reads root first and the category last', () => {
		expect(categoryPath(CATALOG, 'stainless').map((c) => c.name)).toEqual([
			'Materials',
			'Fixings',
			'Stainless'
		]);
	});

	it('is just the category for a root, and empty for one that is not there', () => {
		expect(categoryPath(CATALOG, 'services').map((c) => c.name)).toEqual(['Services']);
		expect(categoryPath(CATALOG, 'nobody')).toEqual([]);
	});
});

describe('subtreeIds', () => {
	it('is the category and everything under it — what a move may not pick as a parent', () => {
		expect([...subtreeIds(CATALOG, 'materials')].sort()).toEqual([
			'fixings',
			'materials',
			'stainless'
		]);
		expect([...subtreeIds(CATALOG, 'stainless')]).toEqual(['stainless']);
	});
});
