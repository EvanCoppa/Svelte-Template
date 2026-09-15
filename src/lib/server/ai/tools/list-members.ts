import { tool } from 'ai';
import { z } from 'zod';
import { memberName } from '$lib/components/staff/member';
import { listStaff } from '$lib/server/staff';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

/**
 * Who works here is not privileged inside an organization: a member may read
 * the profile of anyone they share one with, which is what lets the roster,
 * a task card and an assignee picker name a colleague. So this gate is about
 * the tool being USEFUL rather than about secrecy — it is offered wherever a
 * person who works here can be named: the roster itself, the records that
 * carry an assignee, and the graph they appear in.
 *
 * `staff` read is NOT required, deliberately: the tasks page shows the same
 * names to anyone who may put someone on a card, and an assistant that
 * refused where the page does not would be the second answer to one question.
 */
export const listMembersAccess: ToolAccess = {
	anyOf: ['staff', 'tasks', 'deals', 'tickets', 'calendar', 'graph'],
	level: 'read',
	subject: 'the people who work here'
};

export const listMembers = tool({
	description:
		'The people who work at this organization — the colleagues a record can be ASSIGNED to. ' +
		'Use it to turn a name the user said ("assign it to Dana") into the user id assignTask ' +
		'and an assignee field take. These are not contacts: a contact is someone the ' +
		'organization deals with, and findRecords is where those are looked up.',
	inputSchema: z.object({}),
	outputSchema: z.object({
		members: z.array(
			z.object({
				userId: z.string().describe('What assignTask and an assignee field take.'),
				name: z.string(),
				role: z.string().describe('Their standing in the organization: owner, admin or member.'),
				isYou: z
					.boolean()
					.describe(
						'True for the person you are talking to — who a task is for unless they say otherwise.'
					)
			})
		)
	}),
	contextSchema: toolContextSchema,
	execute: async (_input, { context }) => {
		const { supabase, orgId, userId } = requireToolContext(context, listMembersAccess);
		const staff = await listStaff(supabase, orgId);
		return {
			// Named only: what a roster row holds beyond a name — its email,
			// its roles, when it joined — is the staff page's, and naming a
			// person to assign work needs none of it.
			members: staff.map((member) => ({
				userId: member.userId,
				name: memberName(member),
				role: member.role,
				isYou: member.userId === userId
			}))
		};
	}
});
