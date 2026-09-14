/**
 * What a reference-catalog id looks like: a tier (`free`, `pro`), an
 * industry (`crm`, `medical-supplies`) or a feature (`deals`,
 * `best-practices`). These are text primary keys chosen by whoever creates
 * the row, not generated uuids.
 *
 * Said once, here, because two places must agree about it and would
 * otherwise drift: the `[id=key]` param matcher, which decides whether a
 * detail page's URL reaches a load at all, and the create forms in the
 * platform area, which mint the keys those URLs are built from. A key the
 * form accepted but the matcher rejects is a row with no page.
 */
export const CATALOG_KEY = /^[a-z][a-z0-9-]*$/;

/** The message every create form shows for a key that is not one. */
export const CATALOG_KEY_MESSAGE =
	'Use lower-case letters, digits and hyphens, starting with a letter.';

export function isCatalogKey(value: string): boolean {
	return CATALOG_KEY.test(value);
}
