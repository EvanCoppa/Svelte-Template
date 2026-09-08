import { redirect } from '@sveltejs/kit';
import { settingsNav } from '$lib/navigation';
import type { PageServerLoad } from './$types';

/**
 * `/settings` is the door, not a screen: the user menu links here and the
 * settings shell opens on its first section. Keeping the door means the
 * link, the `pages` row and every `?next=/settings` round trip stay valid
 * while the sections behind it change.
 */
export const load: PageServerLoad = async () => {
	throw redirect(303, settingsNav[0].items[0].href);
};
