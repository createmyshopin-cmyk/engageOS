-- Add EngageOS webapp URL to Google Sheets integration (Apps Script ENGAGEOS_BASE_URL).

alter table google_sheets_integrations
  add column if not exists webapp_url text;
