-- Overseas arrival transfer operations.
-- The staff member never sees supplier pricing. BIMED controls booking and dispatch.
alter table recruitment_flight_itineraries
  add column if not exists booking_status text not null default 'planning',
  add column if not exists booking_reference text,
  add column if not exists airline text,
  add column if not exists flight_number text,
  add column if not exists arrival_at timestamptz,
  add column if not exists booked_at timestamptz,
  add column if not exists booking_notes text;

alter table recruitment_flight_itineraries
  add constraint recruitment_flight_itineraries_booking_status_chk
  check (booking_status in ('planning','booked','cancelled'));

create table if not exists recruitment_arrival_transfers (
  id uuid primary key default gen_random_uuid(),
  permit_case_id uuid not null unique references recruitment_staff_permit_cases(id) on delete cascade,
  itinerary_id uuid references recruitment_flight_itineraries(id) on delete set null,
  supplier_name text not null default 'Avatravel',
  supplier_email text not null default 'info@avatravel.ie',
  status text not null default 'pending_flight_booking',
  pickup_airport_code text not null default 'DUB',
  pickup_terminal text,
  pickup_datetime timestamptz,
  destination_name text not null default 'BIMED accommodation',
  destination_address text,
  passenger_count integer not null default 1 check (passenger_count between 1 and 3),
  passenger_names jsonb not null default '[]'::jsonb,
  flight_number text,
  flight_booking_reference text,
  flight_arrival_at timestamptz,
  special_instructions text,
  supplier_request_sent_at timestamptz,
  supplier_request_message_id text,
  supplier_booking_reference text,
  supplier_confirmed_at timestamptz,
  driver_name text,
  driver_phone text,
  vehicle_description text,
  driver_meet_point text,
  supplier_status_note text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending_flight_booking','ready_to_dispatch','supplier_requested','supplier_confirmed','driver_assigned','en_route','arrived','completed','cancelled','failed'))
);

alter table recruitment_arrival_transfers enable row level security;
revoke all on recruitment_arrival_transfers from anon, authenticated;
create index if not exists recruitment_arrival_transfers_status_idx on recruitment_arrival_transfers(status);
create index if not exists recruitment_arrival_transfers_pickup_idx on recruitment_arrival_transfers(pickup_datetime);

insert into recruitment_arrival_transfers(permit_case_id, itinerary_id, passenger_count, passenger_names)
select p.id, i.id, i.passenger_count, i.passengers
from recruitment_staff_permit_cases p
left join recruitment_flight_itineraries i on i.permit_case_id = p.id
where p.flight_airport_pickup_required = true
  and not exists (select 1 from recruitment_arrival_transfers t where t.permit_case_id = p.id);
