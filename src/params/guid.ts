/**
 * A Postgres uuid, as the `[id=guid]` segment of a record page. Any
 * 8-4-4-4-12 hex value — not `z.uuid()`'s strict RFC 4122 version bits,
 * which the seed's fixed ids (`20000000-0000-…`) would fail (the same reason
 * `PUT /api/org` parses with `z.guid()`). Anything else never reaches a load,
 * so a malformed id is a plain 404 rather than a database error.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function match(param: string): boolean {
	return GUID.test(param);
}
