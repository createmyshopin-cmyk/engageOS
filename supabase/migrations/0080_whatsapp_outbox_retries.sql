-- Reliable WhatsApp coupon outbox: bounded retries with observable errors and
-- a next-attempt timestamp for scheduler-driven exponential backoff.

alter table coupons
  add column if not exists wa_last_error text,
  add column if not exists wa_next_attempt_at timestamptz;

create index if not exists coupons_wa_retry_due_idx
  on coupons (business_id, wa_next_attempt_at, created_at)
  where wa_status = 'pending';
