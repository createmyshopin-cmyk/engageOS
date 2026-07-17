-- =============================================================
-- EngageOS — Migration 0031: WATI Participation Template Support
--
-- Adds optional columns to `wati_integrations` to support sending
-- a "Thank you for participating" template message when a customer
-- plays but does not win a prize.
-- =============================================================

ALTER TABLE wati_integrations 
  ADD COLUMN IF NOT EXISTS participation_template_name text,
  ADD COLUMN IF NOT EXISTS participation_template_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS auto_send_participation boolean NOT NULL DEFAULT false;
