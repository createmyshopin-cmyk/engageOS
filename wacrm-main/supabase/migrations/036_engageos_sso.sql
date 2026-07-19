-- EngageOS SSO — single-use nonce ledger for short-lived deep-link tokens.

create table if not exists engageos_sso_redemptions (
  nonce        text primary key,
  account_id   uuid not null references accounts(id) on delete cascade,
  business_id  text not null,
  redeemed_at  timestamptz not null default now()
);

create index if not exists engageos_sso_redemptions_redeemed_idx
  on engageos_sso_redemptions (redeemed_at);

alter table engageos_sso_redemptions enable row level security;
revoke all on engageos_sso_redemptions from anon, authenticated;
