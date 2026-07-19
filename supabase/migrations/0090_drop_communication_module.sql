-- Remove Communication / WACRM bridge module (UI + dispatch outbox).
-- WATI integrations and core coupon wa_status columns are unchanged.

drop trigger if exists communication_stream_event_enqueue on events;

drop function if exists communication_enqueue_birthdays(date);
drop function if exists communication_enqueue_inactive(int, int);
drop function if exists communication_on_stream_event();
drop function if exists communication_reclaim_stuck_jobs(int);
drop function if exists communication_finish_job(uuid, boolean, text, boolean);
drop function if exists communication_finish_job(uuid, boolean, text);
drop function if exists communication_claim_next_job();
drop function if exists communication_enqueue_job(uuid, text, jsonb, text, timestamptz, int);
drop function if exists communication_enqueue_job(uuid, text, jsonb, text, timestamptz);

drop table if exists communication_dispatch_jobs cascade;
drop table if exists communication_rules cascade;
drop table if exists wacrm_webhook_deliveries cascade;
drop table if exists whatsapp_broadcasts cascade;
drop table if exists wa_message_map cascade;
drop table if exists business_integrations cascade;

alter table customers drop column if exists wacrm_contact_id;
