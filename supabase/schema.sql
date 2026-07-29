-- Day One. Single tenant demo: no auth, no RLS.
-- Run in the Supabase SQL editor, or: psql "$DATABASE_URL" -f supabase/schema.sql

drop table if exists trace_steps cascade;
drop table if exists case_results cascade;
drop table if exists runs cascade;
drop table if exists contracts cascade;
drop table if exists invoices cascade;
drop table if exists goods_receipts cascade;
drop table if exists purchase_orders cascade;
drop table if exists price_list_items cascade;
drop table if exists vendors cascade;

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payment_terms text,
  tolerance_pct numeric,
  contract_notes text,
  risk_flags text[]
);

-- Current (live) unit prices per vendor. Case 7 turns on matching the invoice to this list,
-- not to the stale PO that predates the April revision.
create table price_list_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) not null,
  sku text not null,
  description text,
  unit_price numeric not null,
  effective_from date not null,
  unique (vendor_id, sku)
);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id),
  po_number text unique not null,
  line_items jsonb not null,
  total numeric not null,
  currency text default 'USD',
  status text,                   -- 'open' | 'closed' | 'cancelled'
  po_date date                   -- when the PO was cut; the stale-PO rule turns on this
);

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  po_number text references purchase_orders(po_number),
  received_lines jsonb not null,
  received_at date
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id),
  invoice_number text not null,
  po_number_ref text,
  line_items jsonb not null,
  subtotal numeric,
  tax numeric,
  total numeric not null,
  invoice_date date,
  doc_url text,
  source text,                   -- 'docile' | 'synthetic'
  gt_action text not null,       -- ground truth: 'approve'|'reject'|'escalate'
  gt_reason text not null,       -- why, in a controller's words
  difficulty text,               -- 'clean'|'exception'|'ambiguous'; null = ledger history, not a test case
  case_no int                    -- 1..15, the numbering the corpus doc refers to
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1,
  spec jsonb not null,
  transcript text,
  parent_id uuid references contracts(id),
  created_at timestamptz default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references contracts(id),
  started_at timestamptz default now(),
  finished_at timestamptz,
  scorecard jsonb
);

create table case_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) on delete cascade,
  invoice_id uuid references invoices(id),
  action text,
  confidence numeric,
  rationale text,
  correct boolean,
  failure_mode text
);

create table trace_steps (
  id bigserial primary key,
  case_result_id uuid references case_results(id) on delete cascade,
  seq int not null,
  kind text not null,
  tool_name text,
  payload jsonb,
  rule_id text,
  created_at timestamptz default now()
);

-- find_similar_invoices scans vendor + amount + date; case views read traces in order.
create index invoices_vendor_date_idx on invoices (vendor_id, invoice_date);
create index invoices_total_idx on invoices (total);
create index case_results_run_idx on case_results (run_id);
create index trace_steps_case_seq_idx on trace_steps (case_result_id, seq);

-- Public bucket for the scanned documents.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do update set public = true;
