-- ─── Migration: 20260329_fixes ───────────────────────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor
-- Applies all schema additions for the 6 product gaps

-- 1. Add 'expired' status to opportunities
--    (the old constraint only had open/matching/in_progress/filled/cancelled)
ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_status_check;

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_status_check
  CHECK (status IN ('open','matching','in_progress','filled','cancelled','expired'));

-- 2. Profile pause toggle for professionals
ALTER TABLE public.professional_profiles
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- 3. Website field for clients
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS company_website text;

-- 4. Track whether a 48h reminder email has been sent for a match
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

-- 5. One-question interview: client sets a question professionals must answer
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS client_question text;

-- ─── Auto-expiry cron job ─────────────────────────────────────────────────────
-- Requires pg_cron extension (enabled by default in Supabase)
-- Runs daily at 02:00 UTC

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old schedule if it exists (idempotent re-run)
SELECT cron.unschedule('expire-opportunities-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-opportunities-daily'
);

SELECT cron.schedule(
  'expire-opportunities-daily',
  '0 2 * * *',
  $$
    -- Mark opportunities that have passed their expiry date
    UPDATE public.opportunities
    SET status = 'expired', updated_at = now()
    WHERE status = 'open'
      AND expires_at IS NOT NULL
      AND expires_at < now();

    -- Expire pending and accepted matches whose opportunity just expired
    UPDATE public.matches m
    SET status = 'expired', updated_at = now()
    FROM public.opportunities o
    WHERE m.opportunity_id = o.id
      AND o.status = 'expired'
      AND m.status IN ('pending', 'accepted');
  $$
);

-- ─── 48h reminder email cron job ─────────────────────────────────────────────
-- Calls the send-reminder-emails edge function every 6 hours.
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with real values.
-- Find them: Supabase Dashboard → Settings → API

CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('send-48h-reminders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-48h-reminders'
);

-- Uncomment and fill in your project ref + service role key, then run:
/*
SELECT cron.schedule(
  'send-48h-reminders',
  '0 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminder-emails',
      body    := '{}',
      headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb
    );
  $$
);
*/
