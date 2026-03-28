-- ============================================================
-- Matched — Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           text,
  role                text CHECK (role IN ('professional', 'client')),
  onboarding_complete boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ─── professional_profiles ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  headline             text,
  bio                  text,
  years_experience     integer,
  hourly_rate_min      integer,   -- stored in cents
  hourly_rate_max      integer,   -- stored in cents
  availability_hours   integer,
  timezone             text,
  remote_preference    text CHECK (remote_preference IN (
                         'remote_only','hybrid','onsite_only','flexible'
                       )),
  skills               text[]  DEFAULT '{}',
  preferred_industries text[]  DEFAULT '{}',
  preferred_team_size  text,
  is_paused            boolean NOT NULL DEFAULT false,
  embedding            vector(1536),
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- ─── client_profiles ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name       text,
  company_website    text,
  company_size       text,
  industry           text,
  bio                text,
  stripe_customer_id text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

-- ─── opportunities ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunities (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title                  text NOT NULL,
  description            text,
  required_skills        text[]  DEFAULT '{}',
  budget_min             integer,   -- stored in cents
  budget_max             integer,   -- stored in cents
  hours_per_week         integer,
  duration_weeks         integer,
  remote_option          text CHECK (remote_option IN (
                           'remote_only','hybrid','onsite_only','flexible'
                         )),
  timezone_requirements  text,
  status                 text DEFAULT 'open' CHECK (status IN (
                           'open','matching','in_progress','filled','cancelled','expired'
                         )),
  embedding              vector(1536),
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  expires_at             timestamptz
);

-- ─── matches ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matches (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id           uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  professional_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  similarity_score         float,
  status                   text DEFAULT 'pending' CHECK (status IN (
                             'pending','accepted','declined','expired','connected'
                           )),
  professional_message     text,
  responded_at             timestamptz,
  accepted_at              timestamptz,
  declined_at              timestamptz,
  decline_reason           text,
  client_viewed            boolean DEFAULT false,
  reminder_sent            boolean NOT NULL DEFAULT false,
  payment_status           text DEFAULT 'unpaid',
  stripe_payment_intent_id text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

-- ─── Vector search indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS professional_profiles_embedding_idx
  ON public.professional_profiles
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS opportunities_embedding_idx
  ON public.opportunities
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── RPC: match_professionals ─────────────────────────────────
CREATE OR REPLACE FUNCTION match_professionals(
  query_embedding vector(1536),
  budget_max      int,
  budget_min      int,
  required_hours  int,
  remote_option   text,
  match_limit     int DEFAULT 5
)
RETURNS TABLE (user_id uuid, similarity float)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pp.user_id,
    1 - (pp.embedding <=> query_embedding) AS similarity
  FROM professional_profiles pp
  WHERE
    pp.embedding IS NOT NULL
    AND (pp.hourly_rate_max IS NULL OR pp.hourly_rate_max >= budget_min)
    AND (pp.hourly_rate_min IS NULL OR pp.hourly_rate_min <= budget_max)
    AND (pp.availability_hours IS NULL OR pp.availability_hours >= required_hours)
    AND (
      remote_option = 'flexible'
      OR pp.remote_preference::text = 'flexible'
      OR pp.remote_preference::text = remote_option
      OR pp.remote_preference IS NULL
    )
  ORDER BY pp.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- ─── RPC: get_connected_professional_email ────────────────────
CREATE OR REPLACE FUNCTION get_connected_professional_email(match_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prof_email text;
  match_rec  record;
BEGIN
  SELECT m.status, m.professional_id INTO match_rec
  FROM matches m
  JOIN opportunities o ON o.id = m.opportunity_id
  WHERE m.id = match_id
    AND o.client_id = auth.uid();

  IF match_rec IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE matches SET status = 'connected' WHERE id = match_id;

  SELECT u.email INTO prof_email
  FROM matches m
  JOIN auth.users u ON u.id = m.professional_id
  WHERE m.id = match_id;

  RETURN prof_email;
END;
$$;

-- ─── Trigger: auto-create profile on signup ───────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Trigger: updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_professional_profiles_updated_at
  BEFORE UPDATE ON public.professional_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_profiles_updated_at
  BEFORE UPDATE ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
