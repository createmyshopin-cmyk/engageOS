-- Explicit evidence for WhatsApp consent captured at campaign registration.
alter table customer_consents
  add column if not exists campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists disclosure_text text,
  add column if not exists evidence jsonb not null default '{}'::jsonb;

create or replace function record_whatsapp_consent(
  p_business_id uuid,
  p_customer_id uuid,
  p_status text,
  p_source text,
  p_campaign_id uuid default null,
  p_disclosure_text text default null,
  p_evidence jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('granted','revoked') then
    raise exception 'invalid consent status';
  end if;
  if not exists (
    select 1 from customers
    where id=p_customer_id and business_id=p_business_id
  ) then
    raise exception 'customer not owned by business';
  end if;
  if p_campaign_id is not null and not exists (
    select 1 from campaigns
    where id=p_campaign_id and business_id=p_business_id
  ) then
    raise exception 'campaign not owned by business';
  end if;

  insert into customer_consents(
    business_id, customer_id, channel, status, source, campaign_id,
    disclosure_text, evidence, consented_at
  ) values (
    p_business_id, p_customer_id, 'whatsapp', p_status, p_source,
    p_campaign_id, p_disclosure_text, coalesce(p_evidence,'{}'::jsonb), now()
  );

  update customers set
    marketing_opt_in=(p_status='granted'),
    wa_opt_out=(p_status='revoked')
  where id=p_customer_id and business_id=p_business_id;
end $$;

revoke execute on function record_whatsapp_consent(
  uuid,uuid,text,text,uuid,text,jsonb
) from public,anon,authenticated;
