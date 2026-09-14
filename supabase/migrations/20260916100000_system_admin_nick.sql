-- Nick joins the platform operators.
--
-- "Owner-level in every organization" has one home in this schema: a row in
-- public.system_admins (see that migration). private.org_role() answers
-- 'owner' for an operator on every org that exists, so every tenant policy
-- already written against it — and private.feature_level(), which gives an
-- owner 'delete' on every feature — carries the grant with nothing per
-- table to wire, and loadOrgContext() puts every org in their switcher.
-- Owner memberships inserted org by org would be the same access for
-- today's orgs only, and would need another migration for every org created
-- after this one.
--
-- The grant is keyed on the account, so this looks the operator up by email
-- rather than pinning a uuid the way seed.sql can: auth user ids differ
-- between the local stack, CI's disposable database and production, and
-- only production has this person. Where the address names nobody the block
-- writes nothing and says so in the deploy log — which is what makes it
-- safe to replay everywhere, alongside `on conflict do nothing`. It is also
-- the failure mode to watch: an address that names nobody grants nobody,
-- silently. This one was checked against production first, where the
-- account is nick@guaranteeth.net — not .com, which is what made checking
-- worth doing.
--
-- The production row was written directly, by the statement this file
-- carries and the path the system_admins migration documents, so there the
-- block finds its row and does nothing. It is kept as the version-
-- controlled record of the grant, and as what restores it to a database
-- rebuilt from migrations.
--
-- Revoking is one statement, and it is not the whole job — a membership row
-- an operator also holds outlives their row here:
--   delete from public.system_admins where user_id = '<uuid>';
do $$
declare
	operator uuid;
begin
	select id into operator
	from auth.users
	where lower(email) = 'nick@guaranteeth.net'
	order by created_at
	limit 1;

	if operator is null then
		raise notice 'No auth user for nick@guaranteeth.net; no operator row written.';
		return;
	end if;

	insert into public.system_admins (user_id, note)
	values (operator, 'Platform operator: Nick (nick@guaranteeth.net).')
	on conflict (user_id) do nothing;
end;
$$;
