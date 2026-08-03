-- Run this once in Supabase SQL Editor (Database > SQL Editor > New query)
-- Adds deal-type and commission tracking to products/sales.

alter table products add column if not exists deal_type text default 'direct';

alter table sales add column if not exists deal_type text default 'direct';
alter table sales add column if not exists commission_amount numeric default 0;
alter table sales add column if not exists status text default 'pending';
alter table sales add column if not exists buyer_phone text;

-- Optional but recommended: keep deal_type values consistent.
alter table products add constraint products_deal_type_check
  check (deal_type in ('direct', 'team', 'both'));

alter table sales add constraint sales_deal_type_check
  check (deal_type in ('direct', 'team'));

alter table sales add constraint sales_status_check
  check (status in ('pending', 'completed', 'cancelled'));
