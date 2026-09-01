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

function toError(error: PostgrestError): Error {
	return new Error(error.message, { cause: error });
}
