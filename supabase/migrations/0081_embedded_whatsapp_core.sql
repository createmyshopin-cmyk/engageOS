-- EngageOS-native snapshot of the embedded WhatsApp CRM objects used by
-- /m/whatsapp. This makes a fresh root migration run self-contained; existing
-- deployments that previously applied wacrm migrations are unchanged.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid,
  default_currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_config (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  user_id uuid,
  phone_number_id text not null,
  waba_id text,
  access_token text not null,
  verify_token text,
  status text not null default 'disconnected',
  connected_at timestamptz,
  registered_at timestamptz,
  subscribed_apps_at timestamptz,
  last_registration_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid,
  phone text not null,
  phone_normalized text,
  name text,
  email text,
  company text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists contacts_account_phone_key on contacts(account_id, phone);
create index if not exists contacts_account_idx on contacts(account_id, updated_at desc);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid,
  name text not null,
  color text not null default '#3b82f6',
  created_at timestamptz default now(),
  unique(account_id, name)
);
create table if not exists contact_tags (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz default now(),
  unique(contact_id, tag_id)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'open' check(status in ('open','pending','closed')),
  assigned_agent_id uuid,
  last_message_text text,
  last_message_at timestamptz,
  unread_count int default 0,
  ai_autoreply_disabled boolean not null default false,
  ai_reply_count int not null default 0,
  ai_handoff_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(account_id, contact_id)
);
create index if not exists conversations_account_time_idx on conversations(account_id, last_message_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null check(sender_type in ('customer','agent')),
  sender_id uuid,
  content_type text not null default 'text',
  content_text text,
  media_url text,
  template_name text,
  message_id text,
  status text not null default 'sent',
  reply_to_message_id uuid references messages(id) on delete set null,
  interactive_reply_id text,
  interactive_payload jsonb,
  ai_generated boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists messages_conversation_time_idx on messages(conversation_id, created_at desc);
create index if not exists messages_meta_id_idx on messages(message_id);

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid,
  name text not null,
  category text not null default 'Marketing',
  language text default 'en_US',
  header_type text,
  header_content text,
  header_handle text,
  header_media_url text,
  body_text text not null,
  footer_text text,
  buttons jsonb,
  sample_values jsonb,
  status text default 'DRAFT',
  meta_template_id text,
  rejection_reason text,
  quality_score text,
  submission_error text,
  last_submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(account_id, name, language)
);

create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid,
  name text not null,
  template_name text not null,
  template_language text not null default 'en_US',
  template_variables jsonb,
  audience_filter jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft',
  total_recipients int default 0,
  sent_count int default 0,
  delivered_count int default 0,
  read_count int default 0,
  replied_count int default 0,
  failed_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  status text not null default 'pending',
  whatsapp_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  error_message text,
  created_at timestamptz default now()
);
create index if not exists broadcast_recipients_wamid_idx
  on broadcast_recipients(whatsapp_message_id) where whatsapp_message_id is not null;

create or replace function refresh_broadcast_counts()
returns trigger language plpgsql set search_path=public as $$
begin
  update broadcasts set
    sent_count=(select count(*) from broadcast_recipients where broadcast_id=coalesce(new.broadcast_id,old.broadcast_id) and status in ('sent','delivered','read','replied')),
    delivered_count=(select count(*) from broadcast_recipients where broadcast_id=coalesce(new.broadcast_id,old.broadcast_id) and status in ('delivered','read','replied')),
    read_count=(select count(*) from broadcast_recipients where broadcast_id=coalesce(new.broadcast_id,old.broadcast_id) and status in ('read','replied')),
    replied_count=(select count(*) from broadcast_recipients where broadcast_id=coalesce(new.broadcast_id,old.broadcast_id) and status='replied'),
    failed_count=(select count(*) from broadcast_recipients where broadcast_id=coalesce(new.broadcast_id,old.broadcast_id) and status='failed'),
    updated_at=now()
  where id=coalesce(new.broadcast_id,old.broadcast_id);
  return coalesce(new,old);
end $$;
drop trigger if exists broadcast_recipients_refresh_counts on broadcast_recipients;
create trigger broadcast_recipients_refresh_counts
after insert or update or delete on broadcast_recipients
for each row execute function refresh_broadcast_counts();

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  description text,
  trigger_type text not null,
  trigger_config jsonb not null default '{}',
  is_active boolean not null default false,
  execution_count int not null default 0,
  last_executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  parent_step_id uuid references automation_steps(id) on delete cascade,
  branch text,
  step_type text not null,
  step_config jsonb not null default '{}',
  position int not null,
  created_at timestamptz not null default now()
);
create table if not exists automation_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  automation_id uuid not null references automations(id) on delete cascade,
  user_id uuid not null,
  contact_id uuid references contacts(id) on delete set null,
  trigger_event text not null,
  steps_executed jsonb not null default '[]',
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);
create table if not exists automation_pending_executions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  automation_id uuid not null references automations(id) on delete cascade,
  user_id uuid not null,
  contact_id uuid references contacts(id) on delete set null,
  log_id uuid references automation_logs(id) on delete set null,
  parent_step_id uuid,
  branch text,
  next_step_position int not null,
  context jsonb not null default '{}',
  status text not null default 'pending',
  run_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  created_by uuid,
  url text not null,
  secret text not null,
  events text[] not null default '{}',
  is_active boolean not null default true,
  last_delivery_at timestamptz,
  failure_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table accounts enable row level security;
alter table whatsapp_config enable row level security;
alter table contacts enable row level security;
alter table tags enable row level security;
alter table contact_tags enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table message_templates enable row level security;
alter table broadcasts enable row level security;
alter table broadcast_recipients enable row level security;
alter table automations enable row level security;
alter table automation_steps enable row level security;
alter table automation_logs enable row level security;
alter table automation_pending_executions enable row level security;
alter table webhook_endpoints enable row level security;

revoke all on accounts, whatsapp_config, contacts, tags, contact_tags,
  conversations, messages, message_templates, broadcasts, broadcast_recipients,
  automations, automation_steps, automation_logs, automation_pending_executions,
  webhook_endpoints from anon, authenticated;
