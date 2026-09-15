import { describe, expect, it } from 'vitest';
import {
	ADMIN_AREA_NAME,
	ADMIN_HOME,
	adminNav,
	adminOrganizationHref,
	adminTitleFor,
	isAdminItemActive
} from './nav';

describe('adminNav', () => {
	it('keeps every entry inside the platform area', () => {
		// Nothing here may point back into the tenant app: the bar is the
		// platform's own navigation, and the one way out is the shell's
		// "Back to app".
		for (const item of adminNav) {
			expect(item.href === ADMIN_HOME || item.href.startsWith(`${ADMIN_HOME}/`)).toBe(true);
		}
	});
});

describe('adminTitleFor', () => {
	it('names each page after its entry', () => {
		expect(adminTitleFor('/admin')).toBe('Overview');
		expect(adminTitleFor('/admin/organizations')).toBe('Organizations');
		expect(adminTitleFor('/admin/tiers')).toBe('Tiers');
	});

	it('lets a deeper page inherit the section it sits under', () => {
		// Until that page's own load names the organization, which wins.
		expect(adminTitleFor(adminOrganizationHref('abc'))).toBe('Organizations');
	});

	it('falls back to the area itself for a path no entry claims', () => {
		expect(adminTitleFor('/admin/something-new')).toBe(ADMIN_AREA_NAME);
	});

	it('does not let the home entry swallow a longer match', () => {
		// '/admin' is a prefix of every other entry, so longest href wins —
		// the same tie-break the pages registry uses.
		expect(adminTitleFor('/admin/features')).toBe('Features');
	});
});

describe('isAdminItemActive', () => {
	it('marks the section a page sits under', () => {
		expect(isAdminItemActive({ href: '/admin/organizations' }, adminOrganizationHref('abc'))).toBe(
			true
		);
	});

	it('does not light up the area root on every page under it', () => {
		expect(isAdminItemActive({ href: ADMIN_HOME }, '/admin/tiers')).toBe(false);
		expect(isAdminItemActive({ href: ADMIN_HOME }, ADMIN_HOME)).toBe(true);
	});
});
