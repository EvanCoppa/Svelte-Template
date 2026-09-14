-- Roofing's graph goes last, because this branch moved what used to be at 900
-- ===========================================================================
-- The graph_in_crm_staff_in_user_menu migration filed `graph` under CRM and
-- gave each industry a position for it, roofing's being 900 — correct against
-- the order roofing had then, where 900 was free and `assets` sat at 700.
--
-- The roofing_industry_depth migration in this series re-numbered roofing's
-- whole CRM section, and 900 is where Properties (`assets`) now sits. Two
-- features at one position is not a crash — the resolver just ties — but a tie
-- makes the sidebar's order arbitrary, and the convention that positions are
-- spaced so a newcomer slots between two others is exactly what stops that.
--
-- So this puts the graph where that migration meant it to go: last in the
-- section, after Callbacks. It is one row because the collision is one row —
-- roofing's is the only industry whose section this series re-numbered, so
-- every other vertical's graph position stands as shipped.
--
--   Quotes 200 · Invoices 300 · Ledger 350 · Homeowners 400 · Homeowner map 450
--   Companies 500 · Suppliers 550 · Calendar 700 · Tasks 800 · Properties 900
--   Callbacks 1000 · Graph 1100

update public.industry_features
set sort_order = 1100
where industry_id = 'roofing' and feature_id = 'graph';
