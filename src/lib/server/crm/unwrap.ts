import type { PostgrestError, PostgrestSingleResponse } from '@supabase/supabase-js';

/**
 * The one error contract for the CRM data modules: every query result goes
 * through here, so callers get typed data back or a thrown `Error` carrying
 * the PostgREST message. Loads let it bubble into the nearest +error
 * boundary; form actions catch it and hand the message to superforms.
 */
export function unwrap<T>({ data, error }: PostgrestSingleResponse<T>): T {
	if (error) throw toError(error);
	return data;
}

/** For mutations that select nothing back: succeed silently or throw. */
export function ensure({ error }: { error: PostgrestError | null }): void {
	if (error) throw toError(error);
}

/**
 * For deletes. RLS silently filters out rows the caller may not delete, and
 * PostgREST reports that as success with zero rows — a member "deleting" a
 * client would otherwise see a success toast over an untouched row. Deletes
 * therefore select the ids back, and zero rows becomes a thrown Error.
 */
export function unwrapDeleted(
	result: PostgrestSingleResponse<{ id: string }[]>,
	entity: string
): void {
	if (unwrap(result).length === 0) {
		throw new Error(`${entity} was not deleted: it does not exist, or you are not allowed to.`);
	}
}

function toError(error: PostgrestError): Error {
	return new Error(error.message, { cause: error });
}
