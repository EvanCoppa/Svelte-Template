import { error } from '@sveltejs/kit';
import { templateCsv } from '$lib/imports';
import { isImportKind } from '$lib/schemas/imports';
import type { RequestHandler } from './$types';

/**
 * A starter file for a kind — the column guide as a CSV with one example
 * row, so what comes back maps with nothing to rename. A GET that answers
 * with a file is the endpoint case (CLAUDE.md, "Server actions vs API
 * endpoints"); it sits under `/import`, so the hook's gate covers it.
 */
export const GET: RequestHandler = ({ params }) => {
	if (!isImportKind(params.kind)) throw error(404, 'No such kind of record.');
	return new Response(templateCsv(params.kind), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${params.kind}-import-template.csv"`
		}
	});
};
