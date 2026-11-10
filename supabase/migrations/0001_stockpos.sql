-- StockPOS · esquema para Supabase (Postgres + RLS).
-- La app funciona hoy local-first (IndexedDB). Este esquema es el destino de la
-- sincronización: mismas tablas y llaves que src/lib/types.ts.

create extension if not exists pgcrypto;

create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'coral',
  address text,
  ivu_rate numeric(6,5) not null default 0.115 check (ivu_rate between 0 and 0.3),
  default_alert_threshold int not null default 5,
  category_thresholds jsonb not null default '{}',
  geofence jsonb,
  created_at timestamptz not null default now()
);

-- El secreto de ponches vive aparte: solo el admin y la Edge Function `punch` lo leen.
create table store_secrets (
  store_id uuid primary key references stores on delete cascade,
  punch_secret text not null
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin','employee')),
  position text,
  hire_date date,
  active boolean not null default true,
  hourly_rate int not null default 0,     -- centavos
  weekly_hours numeric(5,2) not null default 40,
  overtime_rate int,
  health_plan int,
  deduction_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table store_members (
  store_id uuid references stores on delete cascade,
  user_id uuid references profiles on delete cascade,
  primary key (store_id, user_id)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores on delete cascade,
  barcode text not null,
  description text not null,
  category text,
  market_price int,
  sale_price int not null check (sale_price >= 0),
  quantity int not null check (quantity >= 0),
  alert_threshold int,
  photo_path text,                        -- Supabase Storage
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, barcode)
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores,
  employee_id uuid not null references profiles,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash int not null,
  counted_cash int, expected_cash int, cash_sales int, card_sales int, ath_sales int,
  sales_count int, difference int, notes text, report_doc_id uuid
);
create unique index one_open_shift on shifts (employee_id, store_id) where closed_at is null;

-- El id de la venta ES la llave de idempotencia generada por el cliente.
create table sales (
  id uuid primary key,
  store_id uuid not null references stores,
  shift_id uuid not null references shifts,
  employee_id uuid not null references profiles,
  items jsonb not null,
  subtotal int not null, ivu_rate numeric(6,5) not null, ivu int not null, total int not null,
  method text not null check (method in ('cash','athmovil','card')),
  tendered int, change int,
  payment_ref text unique,               -- una confirmación ATH / PaymentIntent no se reusa
  card_last4 text,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  day date not null
);

create table punches (
  id uuid primary key,
  seq bigint not null unique,
  store_id uuid not null references stores,
  employee_id uuid not null references profiles,
  type text not null check (type in ('in','out')),
  at timestamptz not null,
  method text not null,
  location jsonb, distance_m int, note text,
  prev_hash text not null, hash text not null unique, signature text not null
);
-- Los ponches son solo-inserción: nadie (ni el admin) puede editarlos o borrarlos.
create rule punches_no_update as on update to punches do instead nothing;
create rule punches_no_delete as on delete to punches do instead nothing;

create table schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles on delete cascade,
  store_id uuid not null references stores on delete cascade,
  kind text not null check (kind in ('fixed','rotation')),
  cycle_weeks int not null default 1,
  start_date date not null,
  blocks jsonb not null,
  updated_at timestamptz not null default now()
);

create table deduction_types (
  id text primary key, name text not null,
  kind text not null check (kind in ('percent','fixed','healthPlan')),
  value numeric not null, active boolean not null default true, builtin boolean not null default false
);
insert into deduction_types values
  ('ss','Seguro Social','percent',0.062,true,true),
  ('medicare','Medicare','percent',0.0145,true,true),
  ('plan-medico','Plan médico','healthPlan',0,true,true);

create table bonuses (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles, amount int not null, date date not null,
  description text not null, pay_stub_id uuid
);

create table signed_docs (
  id uuid primary key, kind text not null, title text not null,
  store_id uuid references stores, employee_id uuid references profiles,
  payload jsonb not null, hash text not null, signature text not null,
  created_at timestamptz not null default now()
);
create rule docs_no_update as on update to signed_docs do instead nothing;

create table pay_stubs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles, store_id uuid not null references stores,
  period_start date not null, period_end date not null,
  regular_hours numeric(7,2), overtime_hours numeric(7,2), hourly_rate int, overtime_rate int,
  regular_pay int, overtime_pay int, bonuses jsonb, gross int, deductions jsonb, net int,
  doc_id uuid references signed_docs, created_at timestamptz not null default now()
);

create table cert_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles, store_id uuid not null references stores,
  addressee text, purpose text, include_salary boolean not null default true,
  status text not null default 'pending', requested_at timestamptz not null default now(),
  decided_at timestamptz, decision_note text, doc_id uuid references signed_docs
);

-- ---------- Seguridad por fila ----------
create function is_admin() returns boolean language sql stable security definer as
  $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active) $$;
create function in_store(s uuid) returns boolean language sql stable security definer as
  $$ select is_admin() or exists (select 1 from store_members where store_id = s and user_id = auth.uid()) $$;

alter table stores enable row level security;
alter table profiles enable row level security;
alter table store_members enable row level security;
alter table products enable row level security;
alter table shifts enable row level security;
alter table sales enable row level security;
alter table punches enable row level security;
alter table schedules enable row level security;
alter table deduction_types enable row level security;
alter table bonuses enable row level security;
alter table signed_docs enable row level security;
alter table pay_stubs enable row level security;
alter table cert_requests enable row level security;

create policy admin_all on stores for all using (is_admin()) with check (is_admin());
create policy member_read on stores for select using (in_store(id));
alter table store_secrets enable row level security;
create policy admin_secrets on store_secrets for all using (is_admin()) with check (is_admin());

create policy self_read on profiles for select using (id = auth.uid() or is_admin());
create policy admin_write on profiles for all using (is_admin()) with check (is_admin());
create policy members on store_members for select using (user_id = auth.uid() or is_admin());
create policy admin_members on store_members for all using (is_admin()) with check (is_admin());

create policy store_products on products for select using (in_store(store_id));
create policy store_products_ins on products for insert with check (in_store(store_id));
create policy store_products_upd on products for update using (in_store(store_id));
create policy admin_products_del on products for delete using (is_admin());

create policy own_shifts on shifts for all using (employee_id = auth.uid() or is_admin()) with check (employee_id = auth.uid() or is_admin());
create policy store_sales_read on sales for select using (employee_id = auth.uid() or is_admin());
create policy own_sales_ins on sales for insert with check (employee_id = auth.uid() and in_store(store_id));

-- Los ponches los inserta solo la Edge Function `punch` (valida NFC/QR/geocerca y firma).
create policy punches_read on punches for select using (employee_id = auth.uid() or is_admin());

create policy own_schedule on schedules for select using (employee_id = auth.uid() or is_admin());
create policy admin_schedule on schedules for all using (is_admin()) with check (is_admin());
create policy ded_read on deduction_types for select using (true);
create policy ded_admin on deduction_types for all using (is_admin()) with check (is_admin());
create policy bonus_read on bonuses for select using (employee_id = auth.uid() or is_admin());
create policy bonus_admin on bonuses for all using (is_admin()) with check (is_admin());
create policy docs_read on signed_docs for select using (employee_id = auth.uid() or is_admin());
create policy stubs_read on pay_stubs for select using (employee_id = auth.uid() or is_admin());
create policy certs_own on cert_requests for select using (employee_id = auth.uid() or is_admin());
create policy certs_ins on cert_requests for insert with check (employee_id = auth.uid());
create policy certs_admin on cert_requests for update using (is_admin());

-- Venta atómica e idempotente del lado del servidor.
create function commit_sale(p_sale jsonb) returns sales language plpgsql security invoker as $$
declare s sales; it jsonb;
begin
  select * into s from sales where id = (p_sale->>'id')::uuid;
  if found then return s; end if;               -- reintento: misma venta
  for it in select * from jsonb_array_elements(p_sale->'items') loop
    update products set quantity = quantity - (it->>'qty')::int, updated_at = now()
      where id = (it->>'productId')::uuid and quantity >= (it->>'qty')::int;
    if not found then raise exception 'Sin existencias para %', it->>'description'; end if;
  end loop;
  insert into sales select * from jsonb_populate_record(null::sales, p_sale) returning * into s;
  return s;
end $$;
