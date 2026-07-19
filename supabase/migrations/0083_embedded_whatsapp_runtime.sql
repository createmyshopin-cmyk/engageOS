-- Runtime-critical constraints/RPCs omitted from the compact 0081 snapshot.
-- These are EngageOS-safe slices of wacrm migrations 003, 007, 009, 013, 022.

-- Webhook routing must resolve exactly one tenant per Meta phone number.
do $$
begin
  if exists (
    select 1 from whatsapp_config
    group by phone_number_id having count(*) > 1
  ) then
    raise exception 'Duplicate whatsapp_config.phone_number_id values must be resolved';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='whatsapp_config'::regclass
      and conname='whatsapp_config_phone_number_id_key'
  ) then
    alter table whatsapp_config
      add constraint whatsapp_config_phone_number_id_key unique(phone_number_id);
  end if;
end $$;

-- Stable, database-owned phone dedupe key.
drop index if exists idx_contacts_account_phone_normalized;
do $$
declare generated_flag "char";
begin
  select attgenerated into generated_flag
  from pg_attribute
  where attrelid='contacts'::regclass and attname='phone_normalized';

  if generated_flag is null then
    alter table contacts add column phone_normalized text
      generated always as (regexp_replace(phone, '\D', '', 'g')) stored;
  elsif generated_flag = '' then
    alter table contacts drop column phone_normalized;
    alter table contacts add column phone_normalized text
      generated always as (regexp_replace(phone, '\D', '', 'g')) stored;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from contacts
    where phone_normalized <> ''
    group by account_id, phone_normalized having count(*) > 1
  ) then
    raise exception 'Duplicate normalized contact phones must be resolved';
  end if;
end $$;

create unique index if not exists idx_contacts_account_phone_normalized
  on contacts(account_id, phone_normalized)
  where phone_normalized <> '';

-- Meta delivery receipts correlate to one broadcast recipient.
alter table broadcast_recipients
  add column if not exists whatsapp_message_id text;
create unique index if not exists idx_broadcast_recipients_wamid
  on broadcast_recipients(whatsapp_message_id)
  where whatsapp_message_id is not null;
create index if not exists idx_broadcast_recipients_broadcast_status
  on broadcast_recipients(broadcast_id, status);

-- Customer and agent reactions received by the Meta webhook.
alter table messages
  add column if not exists reply_to_message_id uuid
  references messages(id) on delete set null;
create index if not exists idx_messages_reply_to
  on messages(reply_to_message_id) where reply_to_message_id is not null;

create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  actor_type text not null check(actor_type in ('customer','agent')),
  actor_id uuid,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(message_id, actor_type, actor_id)
);
create index if not exists idx_message_reactions_conversation
  on message_reactions(conversation_id);
create index if not exists idx_message_reactions_message
  on message_reactions(message_id);
alter table message_reactions enable row level security;
revoke all on message_reactions from anon, authenticated;

-- Concurrent automation executions must increment atomically.
create or replace function increment_automation_execution_count(
  p_automation_id uuid
) returns void
language sql security definer set search_path=public as $$
  update automations
  set execution_count=execution_count+1, last_executed_at=now()
  where id=p_automation_id;
$$;
revoke all on function increment_automation_execution_count(uuid)
  from public, anon, authenticated;
grant execute on function increment_automation_execution_count(uuid)
  to service_role;
