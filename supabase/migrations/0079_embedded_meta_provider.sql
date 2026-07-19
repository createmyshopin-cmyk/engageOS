-- The WhatsApp module now embeds the CRM/Meta engine in EngageOS. The legacy
-- external-wacrm URL and API-key columns are no longer credentials and must
-- not be populated with localhost/dummy values.

alter table business_integrations
  alter column base_url drop not null,
  alter column api_key_enc drop not null,
  alter column api_key_last4 drop not null;

comment on column business_integrations.base_url is
  'Legacy external-wacrm URL; NULL for embedded Meta Cloud API integrations.';
comment on column business_integrations.api_key_enc is
  'Legacy external-wacrm API key; NULL for embedded Meta Cloud API integrations.';
comment on column business_integrations.api_key_last4 is
  'Legacy external-wacrm key suffix; NULL for embedded Meta Cloud API integrations.';
