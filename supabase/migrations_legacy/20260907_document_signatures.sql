-- Extends the existing contract e-signature table to also cover the employee handbook and job
-- description, instead of only the contract. Existing rows default to 'contract' so nothing
-- about the live contract-signing flow changes.
alter table recruitment_contract_signatures
  add column if not exists doc_type text not null default 'contract';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recruitment_contract_signatures_doc_type_check'
  ) then
    alter table recruitment_contract_signatures
      add constraint recruitment_contract_signatures_doc_type_check
      check (doc_type in ('contract', 'handbook', 'job_description'));
  end if;
end $$;

create index if not exists recruitment_contract_signatures_doc_type_idx
  on recruitment_contract_signatures(application_id, doc_type);
