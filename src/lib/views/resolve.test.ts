import { describe, expect, it } from 'vitest';
import type { Feature } from '$lib/features/types';
import { defaultsFor, resolveView, viewHref, type ViewRegistryRow } from './resolve';

const feature = (id: string, overrides: Partial<Feature> = {}): Feature => ({
	id,
	name: 'Vendors',
	noun: 'vendor',
	description: null,
	route: viewHref(id),
	icon: 'truck',
	category: 'crm',
	sort_order: 12,
	created_at: '',
	...overrides
});

const suppliers: ViewRegistryRow = {
	id: 'suppliers',
	source: 'company',
	filter: { where: [{ field: 'relationship', op: 'in', values: ['supplier'] }] },
	layouts: ['table', 'map'],
	default_layout: 'table'
};

describe('resolveView', () => {
	it('turns a row into a definition', () => {
		const view = resolveView(suppliers, feature('suppliers'));
		expect(view).toEqual({
			id: 'suppliers',
			href: '/views/suppliers',
			source: 'company',
			filter: { where: [{ field: 'relationship', op: 'in', values: ['supplier'] }] },
			layouts: ['table', 'map'],
			defaultLayout: 'table'
		});
	});

	it('parses a contact view with its own schema', () => {
		const view = resolveView(
			{
				id: 'patient-map',
				source: 'contact',
				filter: { where: [{ field: 'has_company', op: 'eq', value: false }] },
				layouts: ['map', 'table'],
				default_layout: 'map'
			},
			feature('patient-map', { noun: 'patient' })
		);
		expect(view.source).toBe('contact');
		expect(view.defaultLayout).toBe('map');
	});

	it('names the view when a row is wrong', () => {
		expect(() =>
			resolveView(
				{ ...suppliers, filter: { where: [{ field: 'title', op: 'ilike', value: 'x' }] } },
				feature('suppliers')
			)
		).toThrow('View suppliers has an invalid filter');
		expect(() => resolveView({ ...suppliers, source: 'deal' }, feature('suppliers'))).toThrow(
			'lists deal'
		);
		expect(() =>
			resolveView({ ...suppliers, layouts: ['table', 'kanban'] }, feature('suppliers'))
		).toThrow('layout');
		expect(() =>
			resolveView({ ...suppliers, default_layout: 'map', layouts: ['table'] }, feature('suppliers'))
		).toThrow('does not offer');
		expect(() => resolveView(suppliers, feature('suppliers', { route: '/suppliers' }))).toThrow(
			'registered at /suppliers, not /views/suppliers'
		);
		expect(() => resolveView(suppliers, feature('suppliers', { noun: null }))).toThrow(
			'names no noun'
		);
	});
});

describe('defaultsFor', () => {
	it('pre-fills the create form with every enum column the filter pins to one value', () => {
		const view = resolveView(
			{
				...suppliers,
				filter: {
					where: [
						{ field: 'relationship', op: 'in', values: ['supplier'] },
						{ field: 'status', op: 'in', values: ['active', 'lead'] },
						{ field: 'name', op: 'ilike', value: 'steel' }
					]
				}
			},
			feature('suppliers')
		);
		expect(defaultsFor(view)).toEqual({ relationship: 'supplier' });
	});

	it('leaves the form alone for a filter that pins nothing', () => {
		const view = resolveView({ ...suppliers, filter: { where: [] } }, feature('suppliers'));
		expect(defaultsFor(view)).toEqual({});
	});
});
