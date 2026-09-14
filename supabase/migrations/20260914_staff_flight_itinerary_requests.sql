alter table recruitment_staff_permit_cases
  add column if not exists flight_request_status text not null default 'not_started',
  add column if not exists flight_request_submitted_at timestamptz,
  add column if not exists flight_home_country text,
  add column if not exists flight_departure_airport_code text,
  add column if not exists flight_departure_airport_name text,
  add column if not exists flight_destination_airport_code text default 'DUB',
  add column if not exists flight_destination_airport_name text default 'Dublin Airport',
  add column if not exists flight_passenger_count integer,
  add column if not exists flight_passengers jsonb not null default '[]'::jsonb,
  add column if not exists flight_travel_date date,
  add column if not exists flight_cabin_class text default 'economy',
  add column if not exists flight_virtual_itinerary jsonb not null default '{}'::jsonb,
  add column if not exists flight_itinerary_generated_at timestamptz,
  add column if not exists flight_staff_notice_hours integer default 72,
  add column if not exists flight_airport_pickup_required boolean not null default true,
  add column if not exists flight_updated_at timestamptz;

alter table recruitment_staff_permit_cases
  add constraint recruitment_staff_permit_cases_flight_request_status_chk
  check (flight_request_status in ('not_started','draft','submitted','reviewed','ready_for_booking','booked','cancelled'));
alter table recruitment_staff_permit_cases
  add constraint recruitment_staff_permit_cases_flight_passenger_count_chk
  check (flight_passenger_count is null or flight_passenger_count between 1 and 3);
alter table recruitment_staff_permit_cases
  add constraint recruitment_staff_permit_cases_flight_cabin_class_chk
  check (flight_cabin_class is null or flight_cabin_class = 'economy');

create index if not exists recruitment_staff_permit_cases_flight_status_idx on recruitment_staff_permit_cases(flight_request_status);

create table if not exists recruitment_flight_airports (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  country_name text not null,
  airport_code text not null,
  airport_name text not null,
  is_home_departure boolean not null default true,
  enabled boolean not null default true,
  unique(country_code, airport_code)
);
alter table recruitment_flight_airports enable row level security;
revoke all on recruitment_flight_airports from anon, authenticated;

insert into recruitment_flight_airports(country_code,country_name,airport_code,airport_name,is_home_departure,enabled)
values ('NG','Nigeria','LOS','Murtala Muhammed International Airport',true,true)
on conflict (country_code,airport_code) do update set airport_name=excluded.airport_name, enabled=true, is_home_departure=true;

create table if not exists recruitment_flight_itineraries (
  id uuid primary key default gen_random_uuid(),
  permit_case_id uuid not null unique references recruitment_staff_permit_cases(id) on delete cascade,
  route text not null,
  departure_airport_code text not null,
  departure_airport_name text not null,
  destination_airport_code text not null default 'DUB',
  destination_airport_name text not null default 'Dublin Airport',
  travel_date date not null,
  passenger_count integer not null check (passenger_count between 1 and 3),
  cabin_class text not null default 'economy' check (cabin_class='economy'),
  passengers jsonb not null default '[]'::jsonb,
  status text not null default 'virtual',
  airline_note text not null default 'BIMED will book the cheapest suitable economy flight available at the time of booking.',
  change_notice_hours integer not null default 72,
  baggage_note text not null default 'Any baggage above the airline economy allowance is the passenger''s responsibility and cost.',
  airport_pickup_included boolean not null default true,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('virtual','booked','cancelled'))
);
alter table recruitment_flight_itineraries enable row level security;
revoke all on recruitment_flight_itineraries from anon, authenticated;
create index if not exists recruitment_flight_itineraries_date_idx on recruitment_flight_itineraries(travel_date);
