-- Workforce-request extensions for BIMED Healthcare.
-- Supports shift swaps and keeps the original shift request auditable.

alter table if exists recruitment_shift_requests
  add column if not exists requested_shift_id uuid references recruitment_workforce_shifts(id) on delete cascade;

create index if not exists shift_requests_requested_shift_idx
  on recruitment_shift_requests(requested_shift_id, created_at desc);

-- Prevent a duplicate open swap between the same two shifts/staff records.
create unique index if not exists shift_requests_open_swap_idx
  on recruitment_shift_requests(shift_id, requested_shift_id, staff_id)
  where request_type = 'swap' and status = 'pending';
