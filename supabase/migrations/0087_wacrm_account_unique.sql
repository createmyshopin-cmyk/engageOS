-- One WACRM account_id may only bridge to one EngageOS business.
-- Prevents ambiguous webhook routing when two tenants share a WACRM instance.

create unique index if not exists business_integrations_account_id_unique_idx
  on business_integrations (account_id)
  where status <> 'disconnected';
