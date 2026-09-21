-- Canonical accommodation payment account used for newly issued BIMED accommodation invoices.
-- The invoice renderer also falls back to these details when an issued document has no
-- payment-account snapshot, so the published invoice still carries usable payment instructions.

begin;

update public.recruitment_payment_accounts
set is_active = false,
    updated_at = now()
where is_active = true;

do $$
declare
  v_id uuid;
begin
  select id
    into v_id
  from public.recruitment_payment_accounts
  where account_name = 'WEBGEEK TECHNOLOGIES LTD'
    and iban = 'DE81202208000048523738'
  order by updated_at desc
  limit 1;

  if v_id is null then
    insert into public.recruitment_payment_accounts (
      account_name,
      bank_name,
      iban,
      bic_swift,
      account_number,
      sort_code,
      branch_details,
      payment_reference_instructions,
      currency,
      is_active
    ) values (
      'WEBGEEK TECHNOLOGIES LTD',
      'Banking Circle - German Branch',
      'DE81202208000048523738',
      'SXPYDEHH',
      '00008988',
      '04-09-97',
      'UK local account details: Account 00008988 · Sort code 04-09-97',
      'Use the BIMED invoice number as the payment reference.',
      'EUR',
      true
    );
  else
    update public.recruitment_payment_accounts
    set account_name = 'WEBGEEK TECHNOLOGIES LTD',
        bank_name = 'Banking Circle - German Branch',
        iban = 'DE81202208000048523738',
        bic_swift = 'SXPYDEHH',
        account_number = '00008988',
        sort_code = '04-09-97',
        branch_details = 'UK local account details: Account 00008988 · Sort code 04-09-97',
        payment_reference_instructions = 'Use the BIMED invoice number as the payment reference.',
        currency = 'EUR',
        is_active = true,
        updated_at = now()
    where id = v_id;
  end if;
end $$;

commit;
