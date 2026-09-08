-- Settings became a shell of its own, so its sections need their own titles.
--
-- Settings is no longer one page with every account form stacked on it: it
-- is entered from the user menu, swaps the sidebar for the sections in
-- `settingsNav` (src/lib/navigation.ts), and each section is a route. Shell
-- pages like these belong to no feature (feature_id null) and are exempt
-- from the feature gate — same as the '/settings' and '/settings/features'
-- rows the pages migration already ships.
--
-- '/settings' itself keeps its row: the load there redirects to the first
-- section, so nothing renders under that title, but the path stays a valid
-- destination for the user menu and for `?next=/settings`.

insert into public.pages (id, feature_id, path, title) values
	('settings-profile', null, '/settings/profile', 'Profile'),
	('settings-security', null, '/settings/security', 'Security')
on conflict (id) do nothing;
