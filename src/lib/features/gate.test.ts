import { describe, expect, it } from 'vitest';
import { featureGateFor, matchFeature, passesFeatureGate } from './gate';
import type { Feature, FeatureMap, FeatureMode } from './types';

function feature(id: string, route: string): Feature {
	return {
		id,
		name: id,
		description: null,
		route,
		icon: null,
		category: 'platform',
		sort_order: 0,
		created_at: '2026-01-01T00:00:00Z'
	};
}

function features(entries: [id: string, route: string, mode: FeatureMode][]): FeatureMap {
	return Object.fromEntries(
		entries.map(([id, route, mode]) => [id, { feature: feature(id, route), mode }])
	);
}

const map = features([
	['home', '/', 'enabled'],
	['clients', '/clients', 'enabled'],
	['pipeline', '/clients/pipeline', 'locked_visible'],
	['best-practices', '/best-practices', 'locked_visible'],
	['deals', '/deals', 'hidden'],
	['tasks', '/tasks', 'disabled'],
	['tickets', '/tickets', 'enabled']
]);

const readAll = () => true;
const readNone = () => false;

describe('matchFeature', () => {
	it('matches a route and everything nested under it', () => {
		expect(matchFeature('/clients', map)?.feature.id).toBe('clients');
		expect(matchFeature('/clients/42', map)?.feature.id).toBe('clients');
	});

	it('prefers the longest route', () => {
		expect(matchFeature('/clients/pipeline', map)?.feature.id).toBe('pipeline');
		expect(matchFeature('/clients/pipeline/7', map)?.feature.id).toBe('pipeline');
	});

	it('never matches home as a prefix, nor a route as a partial segment', () => {
		expect(matchFeature('/', map)?.feature.id).toBe('home');
		expect(matchFeature('/anything', map)).toBeNull();
		expect(matchFeature('/clientsx', map)).toBeNull();
	});
});

describe('featureGateFor', () => {
	it('lets an enabled feature through when the caller can read it', () => {
		expect(featureGateFor('/clients', map, readAll)).toBeNull();
		expect(featureGateFor('/clients/42', map, readAll)).toBeNull();
		expect(featureGateFor('/', map, readAll)).toBeNull();
	});

	it('refuses an enabled feature the caller has no read grant on', () => {
		expect(featureGateFor('/clients', map, readNone)).toEqual({
			status: 403,
			message: 'You do not have access to this page.'
		});
		expect(featureGateFor('/clients', map, (id) => id === 'clients')).toBeNull();
	});

	it('sends a locked feature to the upgrade page with its id', () => {
		expect(featureGateFor('/best-practices', map, readAll)).toEqual({
			redirectTo: '/upgrade?feature=best-practices'
		});
		// Mode is decided before the grant: locked is locked even without read.
		expect(featureGateFor('/best-practices', map, readNone)).toEqual({
			redirectTo: '/upgrade?feature=best-practices'
		});
	});

	it('sends a disabled feature to the org feature settings', () => {
		expect(featureGateFor('/tasks/1', map, readAll)).toEqual({
			redirectTo: '/settings/features?feature=tasks'
		});
	});

	it('answers 404 for a hidden feature, never confirming it exists', () => {
		expect(featureGateFor('/deals', map, readAll)).toEqual({ status: 404, message: 'Not found.' });
		expect(featureGateFor('/deals/abc', map, readNone)).toEqual({
			status: 404,
			message: 'Not found.'
		});
	});

	it('inherits the more specific feature on nested paths', () => {
		expect(featureGateFor('/clients/pipeline', map, readAll)).toEqual({
			redirectTo: '/upgrade?feature=pipeline'
		});
	});

	it('leaves uncataloged paths alone', () => {
		expect(featureGateFor('/notes', map, readNone)).toBeNull();
	});

	it('exempts the settings, upgrade, api and logout surfaces', () => {
		const blocked = features([
			['settings', '/settings', 'hidden'],
			['upgrade', '/upgrade', 'hidden'],
			['api', '/api', 'hidden'],
			['logout', '/logout', 'hidden']
		]);
		expect(featureGateFor('/settings', blocked, readNone)).toBeNull();
		expect(featureGateFor('/settings/features', blocked, readNone)).toBeNull();
		expect(featureGateFor('/upgrade', blocked, readNone)).toBeNull();
		expect(featureGateFor('/api/org', blocked, readNone)).toBeNull();
		expect(featureGateFor('/logout', blocked, readNone)).toBeNull();
		// A prefix exemption is by path segment, not by string prefix.
		expect(
			featureGateFor('/settingsx', features([['x', '/settingsx', 'hidden']]), readAll)
		).toEqual({ status: 404, message: 'Not found.' });
	});

	it('url-encodes the feature id in redirects', () => {
		const odd = features([['a b', '/odd', 'locked_visible']]);
		expect(featureGateFor('/odd', odd, readAll)).toEqual({ redirectTo: '/upgrade?feature=a%20b' });
	});

	it('treats an empty map as no gate at all', () => {
		expect(featureGateFor('/deals', {}, readNone)).toBeNull();
	});
});

describe('passesFeatureGate', () => {
	it('is the boolean form of featureGateFor', () => {
		expect(passesFeatureGate('/clients', map, readAll)).toBe(true);
		expect(passesFeatureGate('/clients', map, readNone)).toBe(false);
		expect(passesFeatureGate('/best-practices', map, readAll)).toBe(false);
		expect(passesFeatureGate('/deals', map, readAll)).toBe(false);
	});
});
