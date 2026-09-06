import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { Feature, FeatureMap, FeatureMode } from '$lib/features/types';
import type { OrgContext } from '$lib/server/org-context';
import type { PermissionLevel, UserAccess } from '$lib/server/roles';
import { supabaseMock } from '$lib/server/crm/test-support';
import type { AssistantToolContext } from './context';

/**
 * Fixtures for the assistant's tests: an org context with chosen feature modes
 * and grants, and a tool context around it. Shared by the tool, agent and
 * endpoint tests so "a member who may only read clients" is spelled once.
 */

export const ORG_ID = '10000000-0000-0000-0000-000000000001';
export const USER_ID = '00000000-0000-0000-0000-000000000001';
export const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001';

const FEATURE_IDS = ['clients', 'deals', 'tasks', 'tickets', 'staff', 'assistant'] as const;

function featureRow(id: string): Feature {
	return {
		id,
		name: id,
		description: null,
		route: `/${id}`,
		icon: null,
		category: 'platform',
		sort_order: 0,
		created_at: '2026-01-01T00:00:00Z'
	};
}

export type OrgFixture = {
	/** Per-feature mode; anything unlisted is `enabled`. */
	modes?: Partial<Record<(typeof FEATURE_IDS)[number], FeatureMode>>;
	role?: UserAccess['role'];
	/** A plain member's grants; ignored for owners and admins, who hold everything. */
	grants?: Record<string, PermissionLevel>;
};

export function orgContext({
	modes = {},
	role = 'owner',
	grants = {}
}: OrgFixture = {}): OrgContext {
	const features: FeatureMap = Object.fromEntries(
		FEATURE_IDS.map((id) => [id, { feature: featureRow(id), mode: modes[id] ?? 'enabled' }])
	);
	const activeOrg = {
		id: ORG_ID,
		name: 'Acme Inc',
		role,
		tierId: 'pro',
		tierName: 'Pro',
		industryId: 'general'
	};
	return {
		organizations: [activeOrg],
		activeOrg,
		features,
		access: { role, roles: [], grants: new Map(Object.entries(grants)) }
	};
}

/** A tool context over a mocked Supabase client; pass the query result the tool should see. */
export function toolContext(
	org: OrgContext = orgContext(),
	result: Parameters<typeof supabaseMock>[0] = {}
): AssistantToolContext & { mock: ReturnType<typeof supabaseMock> } {
	const mock = supabaseMock(result);
	return { supabase: mock.supabase, orgId: ORG_ID, userId: USER_ID, org, mock };
}

/**
 * The SDK's mock model, answering every call with one streamed text. What the
 * SDK sent it is on `doStreamCalls`, which is how the agent and endpoint tests
 * assert the tools and instructions that actually reached the model.
 */
export function streamingModel(text: string): MockLanguageModelV4 {
	return new MockLanguageModelV4({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: 'stream-start', warnings: [] },
					{ type: 'text-start', id: 't1' },
					{ type: 'text-delta', id: 't1', delta: text },
					{ type: 'text-end', id: 't1' },
					{
						type: 'finish',
						finishReason: { unified: 'stop', raw: undefined },
						logprobs: undefined,
						usage: {
							inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
							outputTokens: { total: 4, text: 4, reasoning: undefined }
						}
					}
				]
			})
		})
	});
}
