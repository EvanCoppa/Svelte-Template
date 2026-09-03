import MemberCell from './staff-member-cell.svelte';
import RolesCell from './staff-roles-cell.svelte';
import RowActions from './staff-row-actions.svelte';

/**
 * The cells the staff roster renders through TanStack's `renderComponent`, plus
 * the naming helpers the page's dialogs share with them. The page still owns
 * the data and every handler — each part takes what it shows as a prop.
 */
export { memberInitials, memberName } from './member.js';

export {
	MemberCell,
	RolesCell,
	RowActions,
	//
	MemberCell as StaffMemberCell,
	RolesCell as StaffRolesCell,
	RowActions as StaffRowActions
};
