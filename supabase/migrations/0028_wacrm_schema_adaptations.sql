-- EngageOS V2.2 — Migration 0028: wacrm schema adaptations
-- Fixes foreign key constraints for wacrm tables in the EngageOS environment.
-- EngageOS uses a custom `merchants` table instead of `auth.users`.

-- Drop the foreign key constraint on user_id for whatsapp_config
ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_user_id_fkey;

-- Since auth.users is not used, user_id can no longer be NOT NULL
ALTER TABLE whatsapp_config ALTER COLUMN user_id DROP NOT NULL;

-- Also fix other core wacrm tables that may fail for the same reason if used later
DO $$
BEGIN
  -- We conditionally drop these to avoid errors if they don't exist
  ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_user_id_fkey;
  ALTER TABLE message_templates ALTER COLUMN user_id DROP NOT NULL;

  ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_user_id_fkey;
  ALTER TABLE contacts ALTER COLUMN user_id DROP NOT NULL;

  ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
  ALTER TABLE conversations ALTER COLUMN user_id DROP NOT NULL;

  ALTER TABLE pipelines DROP CONSTRAINT IF EXISTS pipelines_user_id_fkey;
  ALTER TABLE pipelines ALTER COLUMN user_id DROP NOT NULL;

  ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_user_id_fkey;
  ALTER TABLE deals ALTER COLUMN user_id DROP NOT NULL;

  ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_user_id_fkey;
  ALTER TABLE broadcasts ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION
  WHEN undefined_table THEN
    -- If some wacrm tables aren't present, ignore
    NULL;
END $$;
