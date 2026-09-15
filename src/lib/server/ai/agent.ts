import { isStepCount, ToolLoopAgent, type LanguageModel } from 'ai';
import type { AssistantToolContext } from './context';
import { buildInstructions } from './prompts';
import { openaiCallOptions } from './provider';
import { activeToolNames, assistantTools, TOOL_APPROVAL, toolsContextFor } from './tools';
import { recordKindAccess } from './tools/access';

/**
 * Steps per turn. Each step is one model call that ends in text or in tool
 * calls; a question that needs a lookup, a write and a summary is three.
 * `prepareStep` withdraws the tools on the last allowed step so a turn ends
 * in an answer, never in a tool call with no summary.
 */
export const MAX_STEPS = 12;

export type AssistantAgentOptions = {
	model: LanguageModel;
	/** The request: client, org (feature modes, grants) and caller. */
	context: AssistantToolContext;
	/** The thread, so a provider that routes its prompt cache by key keeps one per thread. */
	conversationId?: string | undefined;
	/** The caller's IANA time zone, so "today" resolves where the user is. */
	timeZone?: string | undefined;
	userName?: string | undefined;
};

/**
 * The assistant as the SDK's `ToolLoopAgent`: model, instructions, tools,
 * the tool loop's stop condition and the approval policy are configured here
 * and nowhere else — the endpoint only loads the thread and returns the
 * stream.
 *
 * Built per request rather than once at module load because two settings
 * are the request's: `toolsContext`, the client and org every tool executes
 * with (a construction-time setting in this SDK version — every tool
 * declares a `contextSchema`, so the agent must carry a context), and
 * `activeTools`, the tools this caller may use. The definition is still in
 * one place; only its inputs change.
 */
export function createAssistantAgent({
	model,
	context,
	conversationId,
	timeZone,
	userName
}: AssistantAgentOptions) {
	const { activeOrg } = context.org;
	return new ToolLoopAgent({
		id: 'assistant',
		model,
		instructions: buildInstructions({
			orgName: activeOrg.name,
			tierName: activeOrg.tierName,
			role: activeOrg.role,
			userName,
			timeZone,
			// The kinds of record this caller may read, in the industry's words —
			// the kind-addressed tools take the kind, and the model must not ask
			// for one the org, its tier or its industry does not have.
			kinds: recordKindAccess(context.org)
		}),
		tools: assistantTools,
		toolsContext: toolsContextFor(context),
		// Tools are linked to features: the model sees only the tools whose
		// feature is enabled for the org and whose level the caller holds.
		activeTools: activeToolNames(context.org),
		toolApproval: TOOL_APPROVAL,
		// The summary is what makes the thinking block have anything to show.
		providerOptions: { openai: openaiCallOptions({ conversationId, reasoningSummary: true }) },
		stopWhen: isStepCount(MAX_STEPS),
		prepareStep: ({ stepNumber }) =>
			stepNumber >= MAX_STEPS - 1 ? { toolChoice: 'none' } : undefined,
		runtimeContext: { orgId: context.orgId, userId: context.userId }
	});
}
