import { isRecordSegment, type RecordSegment } from '$lib/crm/records';

/**
 * The `[kind=record]` segment of the generic record page: one of the list
 * routes a CRM record kind is served under (`companies`, `contacts`, …), so
 * `/contacts/<id>` reaches the page and `/settings/<id>` never does. Runs in
 * the browser too, so it stays a pure lookup — see `$lib/crm/records`.
 */
export function match(param: string): param is RecordSegment {
	return isRecordSegment(param);
}
