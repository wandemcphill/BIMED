-- Accommodation invoices are due on the date they are issued.
-- Remove the old rolling/future due-date behaviour and enforce same-day due dates.

update public.recruitment_accommodation_invoices
set due_date = issue_date
where due_date is distinct from issue_date;

create or replace function public.enforce_accommodation_invoice_due_date()
returns trigger
language plpgsql
as $$
begin
  new.due_date := new.issue_date;
  return new;
end;
$$;

drop trigger if exists recruitment_accommodation_invoice_due_date_trg
on public.recruitment_accommodation_invoices;

create trigger recruitment_accommodation_invoice_due_date_trg
before insert or update of issue_date, due_date
on public.recruitment_accommodation_invoices
for each row
execute function public.enforce_accommodation_invoice_due_date();
