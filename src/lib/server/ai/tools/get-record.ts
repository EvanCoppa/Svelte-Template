import type { SupabaseClient } from '@supabase/supabase-js';
import { tool } from 'ai';
import { z } from 'zod';
import type { Database } from '$lib/database.types';
import { listActivities } from '$lib/server/crm/activities';
import { listCustomFields } from '$lib/server/crm/custom-fields';
import {
	describeCustomField,
	getRecord as loadRecord,
	listRelatedRecords,
	type RecordField
} from '$lib/server/crm/records';
import { getRelationships } from '$lib/server/crm/relationships';
import { listTagsFor } from '$lib/server/crm/tags';
import { loadVocabulary } from '$lib/server/features';
import { getDisplayNames } from '$lib/server/profiles';
import { isEditableRecordType, pickerOptions, type EditableRecordType } from '$lib/server/records';
import { RECORD_FORMS } from '$lib/schemas/records';
import { toolContextSchema } from '../context';
import {
	anyRecordAccess,
	canOpenFor,
	isToolActive,
	recordAccess,
	requireToolContext
} from './access';
import { fieldValueText, recordKindSchema, recordRefSchema } from './record-ref';

export const getRecordAccess = anyRecordAccess('read');

/** How many of the record's activities to hand back — the latest, newest first. */
const MAX_ACTIVITIES = 10;

const fieldSchema = z.object({
	label: z.string(),
	value: z.string().nullable(),
	/** Set when the field names another record — follow it with getRecord. */
	record: recordRefSchema.optional()
});

const relatedGroupSchema = z.object({
	kind: recordKindSchema,
	records: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			status: z.string().nullable(),
			meta: z.string().nullable()
		})
	)
});

const relationshipSchema = z.object({
	id: z.string(),
	typeId: z.string(),
	/** The label as it reads from this record: "owns", "assigned to". */
	label: z.string(),
	direction: z.enum(['forward', 'inverse']),
	other: z.object({
		/** A record kind, or "member" for someone who works here (no record page). */
		kind: z.string(),
		id: z.string(),
		name: z.string()
	}),
	startedOn: z.string().nullable(),
	endedOn: z.string().nullable(),
	notes: z.string().nullable()
});

const activitySchema = z.object({
	id: z.string(),
	type: z.string(),
	subject: z.string().nullable(),
	body: z.string().nullable(),
	occurredAt: z.string(),
	by: z.string().nullable()
});

const editableFieldSchema = z.object({
	name: z.string(),
	label: z.string(),
	type: z
		.string()
		.describe(
			'text, email, tel, number, integer, date, datetime, textarea, select (one of options), ' +
				'or a record kind — pass that record’s id, from findRecords.'
		),
	options: z.array(z.object({ value: z.string(), label: z.string() })).optional()
});

const recordSummarySchema = recordRefSchema.extend({
	status: z.array(z.string()).describe('Lifecycle pills: status, stage outcome, kind…'),
	fields: z.array(fieldSchema),
	customFields: z.array(z.object({ label: z.string(), value: z.string().nullable() })),
	tags: z.array(z.string()),
	createdAt: z.string(),
	updatedAt: z.string(),
	editableFields: z.array(editableFieldSchema).optional()
});

/** A record field as the model reads it: its text, and the record it names when it names one. */
function describeField(
	field: RecordField,
	people: ReadonlyMap<string, string>
): z.infer<typeof fieldSchema> {
	const described: z.infer<typeof fieldSchema> = {
		label: field.label,
		value: fieldValueText(field.value, people)
	};
	if (field.value.type === 'record') {
		described.record = { kind: field.value.kind, id: field.value.id, name: field.value.value };
	}
	return described;
}

export const getRecord = tool({
	description:
		'Everything about one record of any kind, with its connections: its fields (a field ' +
		'naming another record carries that record’s kind and id), custom fields, tags, the ' +
		'records that point at it (a company’s contacts, deals, invoices…), its relationships ' +
		'in the graph, and its latest activity. When the record can be edited here, ' +
		'editableFields lists what updateRecord accepts. Follow the ids it returns to reason ' +
		'across records.',
	inputSchema: z.object({
		kind: recordKindSchema,
		id: z.guid().describe('The record id, from findRecords or another tool’s result.')
	}),
	outputSchema: z.object({
		found: z.boolean(),
		record: recordSummarySchema.optional(),
		related: z.array(relatedGroupSchema),
		relationships: z.array(relationshipSchema),
		activities: z.array(activitySchema)
	}),
	contextSchema: toolContextSchema,
	execute: async ({ kind, id }, { context }) => {
		const { supabase, orgId, org } = requireToolContext(context, recordAccess(kind, 'read'));
		const canOpen = canOpenFor(org);
		const entity = { entityType: kind, entityId: id };
		const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);

		const [record, customFields, tags, related, relationships, activities] = await Promise.all([
			loadRecord(supabase, orgId, kind, id, canOpen, vocabulary),
			listCustomFields(supabase, orgId, entity),
			listTagsFor(supabase, orgId, entity),
			listRelatedRecords(supabase, orgId, kind, id, canOpen),
			getRelationships(supabase, orgId, entity, canOpen, vocabulary),
			listActivities(supabase, orgId, { entity })
		]);
		if (!record) return { found: false, related: [], relationships: [], activities: [] };

		const latest = activities.slice(0, MAX_ACTIVITIES);
		const [people, editableFields] = await Promise.all([
			getDisplayNames(
				supabase,
				[
					...record.fields.map((field) =>
						field.value.type === 'person' ? field.value.userId : null
					),
					...latest.map((activity) => activity.author_id)
				].filter((userId): userId is string => userId !== null)
			),
			isEditableRecordType(kind) && isToolActive(org, recordAccess(kind, 'manage'))
				? describeEditableFields(supabase, orgId, kind)
				: undefined
		]);

		const summary: z.infer<typeof recordSummarySchema> = {
			kind,
			id: record.id,
			name: record.name,
			status: record.pills.map((pill) => pill.label),
			fields: record.fields.map((field) => describeField(field, people)),
			customFields: customFields.map(describeCustomField).map((field) => ({
				label: field.label,
				value: fieldValueText(field.value, people)
			})),
			tags: tags.map((tag) => tag.name),
			createdAt: record.createdAt,
			updatedAt: record.updatedAt
		};
		if (editableFields) summary.editableFields = editableFields;

		return {
			found: true,
			record: summary,
			related: related.map((group) => ({
				kind: group.kind,
				records: group.records.map((row) => ({
					id: row.id,
					name: row.name,
					status: row.pill?.label ?? null,
					meta: row.meta
				}))
			})),
			relationships: relationships.map((view) => ({
				id: view.id,
				typeId: view.type.id,
				label: view.label,
				direction: view.direction,
				other: { kind: view.other.entityType, id: view.other.entityId, name: view.other.name },
				startedOn: view.startedOn,
				endedOn: view.endedOn,
				notes: view.notes
			})),
			activities: latest.map((activity) => ({
				id: activity.id,
				type: activity.type,
				subject: activity.subject,
				body: activity.body,
				occurredAt: activity.occurred_at,
				by: activity.author_id ? (people.get(activity.author_id) ?? null) : null
			}))
		};
	}
});

/**
 * The fields `updateRecord` accepts for a kind, from the same registry the
 * edit form renders: a select carries its options, a deal's stage the org's
 * own stages (each labelled with its board), and a party picker says which
 * kind of id it takes. Only asked for when the caller may manage the kind.
 */
async function describeEditableFields(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: EditableRecordType
): Promise<z.infer<typeof editableFieldSchema>[]> {
	const fields = RECORD_FORMS[kind].fields;
	const stages = fields.some((field) => field.type === 'stage')
		? await pickerOptions(supabase, orgId, 'stage')
		: [];
	return fields.map((field) => {
		if (field.type === 'select') {
			return {
				name: field.name,
				label: field.label,
				type: field.type,
				options: (field.options ?? []).map(({ value, label }) => ({ value, label }))
			};
		}
		if (field.type === 'stage') {
			return {
				name: field.name,
				label: field.label,
				type: field.type,
				options: stages.map(({ value, label, sublabel }) => ({
					value,
					label: sublabel ? `${label} (${sublabel})` : label
				}))
			};
		}
		return { name: field.name, label: field.label, type: field.type };
	});
}
