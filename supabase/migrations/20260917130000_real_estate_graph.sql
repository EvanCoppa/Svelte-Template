-- The graph joins real estate too
-- ===========================================================================
-- The graph_in_crm_staff_in_user_menu migration filed the relationship graph
-- at the end of the CRM section and gave each vertical its place in that
-- section explicitly. Real estate was added in the same window and so was not
-- in that list — and it had no `graph` row at all, which means the feature
-- resolves `hidden` for a real-estate org: the one vertical whose records are
-- most obviously a graph is the one that cannot draw it.
--
-- That is not a judgement this industry made; it is a row nobody wrote. The
-- portfolio is a graph in a way a pipeline is not: a building owns its units,
-- a vendor SERVICES a property, a dishwasher is LOCATED_AT one, a tenant
-- holds a lease on another — the `services` and `located_at` types shipped
-- with the properties_and_leases migration for exactly that, and the seed
-- already writes all four. Those links have had no single screen since.
--
-- Rows only, and the same convention as every other vertical: last in the
-- CRM section, after the things with a state that moves.

insert into public.industry_features (industry_id, feature_id, name, noun, sort_order) values
	-- 1000, because this industry's CRM section ends at Acquisitions (900) —
	-- the real_estate_portfolio_features migration renumbered it. The default
	-- name and noun: "Graph" reads the same to a landlord as to a roofer.
	('real-estate', 'graph', null, null, 1000)
on conflict (industry_id, feature_id) do nothing;

-- The three whole-industry rungs are DERIVED from industry_features, so a row
-- added later is granted by re-running the derivation — the conflict clause
-- makes it a no-op for everything they already hold. Same shape as the
-- portfolio migration's.
insert into public.role_permissions (role_id, feature_id, level)
select ladder.role_id, 'graph', ladder.level
from (values
	('b0000000-0000-0000-0008-000000000001'::uuid, 'read'::public.permission_level),
	('b0000000-0000-0000-0008-000000000005', 'manage'),
	('b0000000-0000-0000-0008-000000000006', 'delete')
) as ladder (role_id, level)
on conflict (role_id, feature_id) do nothing;

-- Property Manager — the role this product is for, and the one who asks the
-- question the graph answers ("who services Rowan Street", "which unit is
-- that dishwasher in"). `read` is the whole of it: the graph is read-only in
-- the app, and the page names each kind through that kind's own list module,
-- so a reader without `contacts` sees the buildings and vendors and not the
-- people. Bookkeeper and Accountant are left off for the same reason they
-- were left off `contacts` and `leases` on day one — the CPA's login exists
-- to see what the portfolio costs, not who lives in it.
insert into public.role_permissions (role_id, feature_id, level)
values ('b0000000-0000-0000-0008-000000000004', 'graph', 'read')
on conflict (role_id, feature_id) do nothing;
