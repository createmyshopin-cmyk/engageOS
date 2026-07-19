-- EngageOS V2.2 — Migration 0028: wacrm schema adaptations
-- Fixes foreign key constraints for wacrm tables in the EngageOS environment.
-- EngageOS uses a custom `merchants` table instead of `auth.users`.

-- These adaptations may run before the embedded CRM snapshot on a fresh
-- EngageOS install. Every table is therefore guarded independently.
DO $$
BEGIN
  IF to_regclass('public.whatsapp_config') IS NOT NULL THEN
    ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_user_id_fkey;
    ALTER TABLE whatsapp_config ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.message_templates') IS NOT NULL THEN
    ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_user_id_fkey;
    ALTER TABLE message_templates ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.contacts') IS NOT NULL THEN
    ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_user_id_fkey;
    ALTER TABLE contacts ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.conversations') IS NOT NULL THEN
    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
    ALTER TABLE conversations ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.pipelines') IS NOT NULL THEN
    ALTER TABLE pipelines DROP CONSTRAINT IF EXISTS pipelines_user_id_fkey;
    ALTER TABLE pipelines ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.deals') IS NOT NULL THEN
    ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_user_id_fkey;
    ALTER TABLE deals ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.broadcasts') IS NOT NULL THEN
    ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_user_id_fkey;
    ALTER TABLE broadcasts ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;
