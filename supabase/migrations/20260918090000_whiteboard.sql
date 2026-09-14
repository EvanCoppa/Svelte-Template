-- The whiteboard: one canvas to think on, kept on the device.
-- ===========================================================================
-- A place to sketch the thing you are about to build — boxes, arrows, a
-- circled number, a name next to it — without it becoming a record. Every
-- other page in the app keeps something: a company, a quote, an invoice, a
-- relationship. This one keeps nothing the organization can read, and that is
-- the point of it.
--
-- THE DRAWING IS NOT IN THE DATABASE, and this migration adds no table. A
-- board lives in the browser's `localStorage`, which is the device axis of
-- docs/user-preferences.md — where the theme, the sidebar's collapsed state
-- and the list/board choice already live — for the reason that axis exists:
-- nothing else reads it, no colleague sees it, the organization has no
-- opinion about it, and losing it costs a sketch rather than a record. So
-- there is no table, no RLS policy, no `org_id`, no query key and nothing to
-- invalidate; `src/lib/whiteboard/board.svelte.ts` is the whole of the
-- storage, and it is keyed by user so two people signing in to the same
-- browser do not draw on each other's board.
--
-- What this migration does is the other half, and the half that is always
-- rows: REGISTERING THE PAGE. A page in this app is gated by being in the
-- registry rather than by a check in its load (the features migration), so
-- even a page with no data of its own arrives the same way as every other —
-- a `features` row, its `pages` row, the industries and tiers that include
-- it, and the roles that may read it. That is what puts it in the sidebar
-- and the ⌘K palette, gives it its title and its breadcrumb, and lets an
-- org switch it off at /settings/features like anything else.

-- ---------------------------------------------------------------------------
-- The feature and its page
-- ---------------------------------------------------------------------------
-- Filed under Tools, which is where the things you use on the work sit
-- rather than the things you keep: the catalog, the fee schedule, the
-- bundles — and now the pad. Last in that section (400 on the spaced scale:
-- multiples of 100, restarting per category), because it is the one you
-- reach for while doing something else.
--
-- No noun. A noun is for a kind of record a list counts and a form adds
-- ("Add quote", "3 quotes"); a whiteboard is a surface, and nothing in the
-- app ever says "3 whiteboards".
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('whiteboard', 'Whiteboard', null,
		'A canvas for boxes, arrows and handwriting. Stays in this browser.',
		'/whiteboard', 'pencil-ruler', 'tools', 400)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('whiteboard', 'whiteboard', '/whiteboard', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Every industry, every plan
-- ---------------------------------------------------------------------------
-- Derived from the industries table rather than listed, as the graph's row
-- was: a vertical added later inherits the page instead of quietly losing
-- it. Sketching is not a vertical's speciality — a practice planning a
-- treatment room and a roofer laying out a hip roof want the same canvas —
-- so no industry renames it and none reorders it: a null `sort_order` here
-- inherits the 400 above, and every vertical that orders its own Tools
-- section does so within 100–300 (the industry_feature_order migration), so
-- the pad closes that section everywhere without a row per industry. An
-- industry that later wants its own word for it ("Sketchpad", "Layout")
-- adds `name` on its row, exactly as with any feature.
insert into public.industry_features (industry_id, feature_id)
select i.id, 'whiteboard'
from public.industries i
on conflict (industry_id, feature_id) do nothing;

-- Every plan. There is nothing to meter: the board costs the product no
-- storage, no compute and no support, so gating it would be a tollbooth on
-- an empty road.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'whiteboard'),
	('pro', 'whiteboard'),
	('enterprise', 'whiteboard')
on conflict (tier_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- The one grant
-- ---------------------------------------------------------------------------
-- `read` for every role, and only `read` — the level the hook needs to serve
-- the page at all. The ladder's other two levels have nothing to describe
-- here: `manage` and `delete` exist to say who may write and who may destroy
-- rows other people can see, and a board has no rows and no other people.
-- Whoever can open the page can draw on their own board, and cannot reach
-- anyone else's, because nobody's board ever leaves their browser.
insert into public.role_permissions (role_id, feature_id, level)
select r.id, 'whiteboard', 'read'
from public.roles r
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- Adding to it
-- ---------------------------------------------------------------------------
-- A new tool, ink or shape is app code and nothing here: the shapes are the
-- `SHAPES` list in src/lib/whiteboard/scene.ts, the inks are tokens from
-- app.css, and the stored scene is versioned there (a board that can no
-- longer be read opens empty rather than half-understood). Nothing about a
-- drawing is ever a row, so nothing about a drawing is ever a migration.
--
-- If a board should one day be SHARED — one canvas an org draws on together
-- — that is not this feature growing a table. It is a different feature with
-- a different promise: a tenant-scoped table on the canonical shape, RLS on,
-- realtime, and a name that says whose board it is. This one stays the pad on
-- your own desk.
