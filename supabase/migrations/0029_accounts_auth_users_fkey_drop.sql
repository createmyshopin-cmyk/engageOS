-- EngageOS V2.2 — Migration 0029: wacrm schema adaptations 2
-- The accounts table also references auth.users(id) which fails in EngageOS.

DO $$
BEGIN
  IF to_regclass('public.accounts') IS NOT NULL THEN
    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_owner_user_id_fkey;
    ALTER TABLE accounts ALTER COLUMN owner_user_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
    ALTER TABLE profiles ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.account_invitations') IS NOT NULL THEN
    ALTER TABLE account_invitations DROP CONSTRAINT IF EXISTS account_invitations_created_by_user_id_fkey;
    ALTER TABLE account_invitations DROP CONSTRAINT IF EXISTS account_invitations_accepted_by_user_id_fkey;
  END IF;
END $$;
