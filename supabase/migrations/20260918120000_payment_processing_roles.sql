-- Payment processing: canonical commercial and operations roles
-- ===========================================================================
-- The merchant-services industry already has an industry-scoped role catalog.
-- This migration keeps every existing role id and assignment valid, while
-- making the roles that a payment-processing office needs explicit and using
-- standard job titles in the role picker.
--
-- Owner is intentionally not a row here. It is the organization_members.role
-- value and already receives the owner/admin bypass in private.org_role() and
-- private.feature_level(). That is the existing architecture's safe answer to
-- the organization owner role.
--
-- Reference rows are migration-owned, and all inserts are idempotent. The
-- fixed ids continue the merchant-services segment (0007) of the catalog.

-- ---------------------------------------------------------------------------
-- Existing roles — retain ids and assignments, improve the labels
-- ---------------------------------------------------------------------------

update public.roles
set name = 'Sales Representative',
    description = 'Owns merchant relationships, applications and rate proposals; can see the fee schedule and equipment.'
where id = 'b0000000-0000-0000-0007-000000000002'
  and industry_id = 'merchant-services';

update public.roles
set name = 'Business Development Representative',
    description = 'Works outbound lists by phone: qualifies businesses, collects processing statements and books appointments.'
where id = 'b0000000-0000-0000-0007-000000000007'
  and industry_id = 'merchant-services';

-- ---------------------------------------------------------------------------
-- Canonical specialist and senior sales roles
-- ---------------------------------------------------------------------------

insert into public.roles (id, industry_id, name, description) values
    ('b0000000-0000-0000-0007-000000000008', 'merchant-services',
        'Merchant Onboarding and Support Specialist',
        'Owns merchant onboarding, terminal installations, support issues and PCI follow-through.'),
    ('b0000000-0000-0000-0007-000000000009', 'merchant-services',
        'Account Executive',
        'Owns the full sales cycle and manages the commercial details needed to win and launch a merchant.')
on conflict (id) do nothing;

-- The operations specialist owns the handoff through launch and the support
-- queue. It reads the surrounding commercial context without receiving sales
-- or staff-management authority.
insert into public.role_permissions (role_id, feature_id, level)
select grants.role_id, f.feature_id, grants.level
from (values
    ('b0000000-0000-0000-0007-000000000008'::uuid, 'deals', 'manage'::public.permission_level),
    ('b0000000-0000-0000-0007-000000000008', 'tasks', 'manage'),
    ('b0000000-0000-0000-0007-000000000008', 'assets', 'manage'),
    ('b0000000-0000-0000-0007-000000000008', 'products', 'manage'),
    ('b0000000-0000-0000-0007-000000000008', 'tickets', 'manage'),
    ('b0000000-0000-0000-0007-000000000008', 'calendar', 'manage'),
    ('b0000000-0000-0000-0007-000000000008', 'notes', 'manage'),
    ('b0000000-0000-0000-0007-000000000008', 'companies', 'read'),
    ('b0000000-0000-0000-0007-000000000008', 'contacts', 'read'),
    ('b0000000-0000-0000-0007-000000000008', 'proposals', 'read'),
    ('b0000000-0000-0000-0007-000000000008', 'billables', 'read'),
    ('b0000000-0000-0000-0007-000000000008', 'quick-plans', 'read'),
    ('b0000000-0000-0000-0007-000000000008', 'staff', 'read'),
    ('b0000000-0000-0000-0007-000000000008', 'assistant', 'read')
) as grants (role_id, feature_id, level)
join public.industry_features f
  on f.industry_id = 'merchant-services' and f.feature_id = grants.feature_id
on conflict (role_id, feature_id) do nothing;

-- An Account Executive retains the Sales Representative's full-cycle selling
-- authority and adds control of pricing programs, equipment, terminals and
-- referral relationships. Those extra grants distinguish a senior seller
-- without conflating the role with organization administration.
insert into public.role_permissions (role_id, feature_id, level)
select grants.role_id, f.feature_id, grants.level
from (values
    ('b0000000-0000-0000-0007-000000000009'::uuid, 'companies', 'manage'::public.permission_level),
    ('b0000000-0000-0000-0007-000000000009', 'contacts', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'deals', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'proposals', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'tasks', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'calendar', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'notes', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'billables', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'quick-plans', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'products', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'assets', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'referral-partners', 'manage'),
    ('b0000000-0000-0000-0007-000000000009', 'merchant-map', 'read'),
    ('b0000000-0000-0000-0007-000000000009', 'prospects', 'read'),
    ('b0000000-0000-0000-0007-000000000009', 'tickets', 'read'),
    ('b0000000-0000-0000-0007-000000000009', 'staff', 'read'),
    ('b0000000-0000-0000-0007-000000000009', 'assistant', 'read')
) as grants (role_id, feature_id, level)
join public.industry_features f
  on f.industry_id = 'merchant-services' and f.feature_id = grants.feature_id
on conflict (role_id, feature_id) do nothing;

-- The existing Merchant Support and Onboarding Coordinator roles remain
-- available for organizations already using that finer split. The combined
-- specialist above is the default vocabulary for offices that want one
-- onboarding/operations/support owner, so no existing assignment is changed.
