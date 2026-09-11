-- Orders and shipments become kinds of CRM record (the migration that follows
-- creates the tables). The values ship alone here because Postgres refuses to
-- use one in the transaction that added it, exactly as the party-model
-- migration explains.
--
-- Both earn a place on the shared link. An order carries the ship-to address
-- and the calls about it; a shipment carries the tag you put on the one that
-- went missing. Each `add value` is its own statement, so the two are added
-- in one file and used in the next.
--
-- Alphabetical order is what the generated types list, so: … deal, invoice,
-- order, product … and … purchase, shipment, task, ticket.
alter type public.crm_entity_type add value if not exists 'order' before 'product';
alter type public.crm_entity_type add value if not exists 'shipment' before 'task';
