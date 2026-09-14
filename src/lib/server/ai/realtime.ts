import {
	asSchema,
	experimental_getRealtimeToolDefinitions as getRealtimeToolDefinitions,
	type Experimental_RealtimeSessionConfig as RealtimeSessionConfig,
	type Experimental_RealtimeSetupResponse as RealtimeSetupResponse,
	type JSONValue,
	type ToolSet
} from 'ai';
import { error } from '@sveltejs/kit';
import { voiceSession, type VoiceToolResult } from '$lib/ai/realtime';
import type { OrgContext } from '$lib/server/org-context';
import type { AssistantToolContext } from './context';
import { buildVoiceInstructions } from './prompts';
import { realtimeToken, realtimeVoice, type AiEnv } from './provider';
import {
	assistantTools,
	activeToolNames,
	CARD_TOOLS,
	TOOL_APPROVAL,
	type AssistantToolName
} from './tools';
import { recordKindAccess } from './tools/access';

/**
 * A voice call, server side.
 *
 * A call is the assistant reached by talking, so it is the same assistant:
 * the same tool set, gated by the same features and grants, executed with the
 * same request-scoped client. Only three things differ, and they are the
 * three functions here — the instructions are spoken rather than written, the
 * session is opened with an ephemeral secret rather than a request per turn,
 * and a tool runs one HTTP call at a time instead of inside an agent loop.
 */

/**
 * The tools a call may use: everything a typed turn could use, less anything
 * that pauses for the reader's approval, and less anything that answers with
 * a card.
 *
 * A call has no cards. Approval is a card with Approve and Deny on it — a
 * spoken "yes" is not a decision this app can evidence afterwards, and the
 * tools behind that gate delete data or change a record — so neither is
 * offered on a call, and the model is told nothing about them. An artifact
 * tool's result is a card too (a table to filter, a slot to click, a line to
 * tick — `CARD_TOOLS`), and spoken it would be a list of ids nobody asked to
 * hear. The typed thread is where you delete, edit and pack things.
 */
export function voiceToolNames(org: OrgContext): AssistantToolName[] {
	return activeToolNames(org).filter(
		(name) => !Object.hasOwn(TOOL_APPROVAL, name) && !CARD_TOOLS.some((card) => card === name)
	);
}

/** Those tools, as the set the SDK reads schemas off. */
export function voiceTools(org: OrgContext): ToolSet {
	return Object.fromEntries(voiceToolNames(org).map((name) => [name, assistantTools[name]]));
}

export type VoiceSetupOptions = {
	context: AssistantToolContext;
	timeZone?: string | undefined;
	userName?: string | undefined;
	/** Injectable env, so a test can vary the model and the voice. */
	source?: AiEnv | undefined;
};

/**
 * The session a call is opened with: how it listens (`voiceSession()`, the
 * same values the browser states, from the one place that spells them), what
 * it may call, what it is told, and the voice it says it in.
 *
 * The instructions and the voice are set here, when the client secret is
 * minted, so neither is a value the browser could choose — a caller who
 * reshaped the session update it sends would still be talking to this
 * organization's assistant, because a `session.update` only changes the
 * fields it carries.
 */
export async function voiceSessionConfig({
	context,
	timeZone,
	userName,
	source
}: VoiceSetupOptions): Promise<RealtimeSessionConfig> {
	const { activeOrg } = context.org;
	return {
		...voiceSession(),
		instructions: buildVoiceInstructions({
			orgName: activeOrg.name,
			tierName: activeOrg.tierName,
			role: activeOrg.role,
			userName,
			timeZone,
			kinds: recordKindAccess(context.org)
		}),
		voice: realtimeVoice(source),
		tools: await getRealtimeToolDefinitions({ tools: voiceTools(context.org) })
	};
}

/**
 * Everything the browser needs to open a call: the ephemeral secret, where to
 * connect, and the tool definitions. The SDK's `RealtimeSetupResponse` shape,
 * because the session fetches this itself as its setup endpoint.
 */
export async function realtimeSetup(options: VoiceSetupOptions): Promise<RealtimeSetupResponse> {
	const config = await voiceSessionConfig(options);
	const { token, url, expiresAt } = await realtimeToken(config, options.source);
	const tools = config.tools ?? [];
	return expiresAt === undefined ? { token, url, tools } : { token, url, expiresAt, tools };
}

/**
 * One tool call from a call, run with the caller's own session.
 *
 * The AI SDK's realtime guide asks for an endpoint per tool rather than one
 * that runs a tool by name, because a generic route is easy to build without
 * the authentication, validation and authorization a hand-written one would
 * have. This app's answer is to have all three, in the one place that already
 * expresses them for every tool: the name must be a tool this caller may use
 * right now (`voiceToolNames()` — the feature enabled for the org and the
 * level held), the input is validated against that tool's own schema before
 * anything runs, `requireToolContext()` checks the access a second time
 * inside the tool, and the data module underneath sees RLS and column grants
 * exactly as it does for a person. Seventeen endpoints repeating that would
 * be seventeen chances to leave one of them out.
 *
 * A tool that fails answers with its message rather than throwing: the
 * message becomes the tool's output, the model reads it and says what went
 * wrong. Only a call that should have been impossible — a name this caller
 * has no tool for, input that does not fit its schema — is an HTTP error.
 */
export async function runVoiceTool(
	context: AssistantToolContext,
	name: string,
	input: JSONValue
): Promise<VoiceToolResult> {
	if (!isVoiceTool(context.org, name)) {
		throw error(403, 'That is not a tool this session can use.');
	}

	const tool: ToolSet[string] = assistantTools[name];
	const schema = asSchema(tool.inputSchema);
	const run = tool.execute;
	// Every assistant tool has both; a tool that grew one without the other
	// would be a tool this endpoint cannot vouch for, so it refuses rather
	// than running something it did not validate.
	if (!schema.validate || !run) {
		throw error(400, `${name} cannot be run from a call.`);
	}

	const validated = await schema.validate(input);
	if (!validated.success) {
		throw error(400, `Those are not valid arguments for ${name}.`);
	}

	try {
		return await run(validated.value, {
			// The model's own call id never reaches the server: nothing here reads
			// it, and a client-supplied one would be a value we did not mint.
			toolCallId: crypto.randomUUID(),
			messages: [],
			context
		});
	} catch (cause) {
		return { error: cause instanceof Error ? cause.message : 'That did not work.' };
	}
}

/** Whether a name from the wire is a tool this session may run. */
function isVoiceTool(org: OrgContext, name: string): name is AssistantToolName {
	return voiceToolNames(org).some((tool) => tool === name);
}
