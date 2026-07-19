-- Drop embedded Meta / wacrm CRM storage. WATI (wati_integrations) and core
-- coupon delivery columns (coupons.wa_*, customers.wa_opt_out) are unchanged.

-- Embedded CRM runtime (0081 / 0083)
drop trigger if exists broadcast_recipients_refresh_counts on broadcast_recipients;
drop function if exists refresh_broadcast_counts();
drop function if exists increment_automation_execution_count(uuid);

drop table if exists message_reactions cascade;
drop table if exists automation_pending_executions cascade;
drop table if exists automation_logs cascade;
drop table if exists automation_steps cascade;
drop table if exists automations cascade;
drop table if exists webhook_endpoints cascade;
drop table if exists broadcast_recipients cascade;
drop table if exists broadcasts cascade;
drop table if exists messages cascade;
drop table if exists message_templates cascade;
drop table if exists conversations cascade;
drop table if exists contact_tags cascade;
drop table if exists tags cascade;
drop table if exists contacts cascade;
drop table if exists whatsapp_config cascade;
drop table if exists accounts cascade;

-- EngageOS ↔ wacrm bridge tables (0027)
drop table if exists wacrm_webhook_deliveries cascade;
drop table if exists whatsapp_broadcasts cascade;
drop table if exists wa_message_map cascade;
drop table if exists business_integrations cascade;

alter table customers drop column if exists wacrm_contact_id;
