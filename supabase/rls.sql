-- ============================================================
-- Matched — Row Level Security Policies
-- Run this AFTER schema.sql in Supabase SQL Editor
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches             ENABLE ROW LEVEL SECURITY;

-- ─── profiles ────────────────────────────────────────────────
CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ─── professional_profiles ───────────────────────────────────
CREATE POLICY "Professional profiles viewable by authenticated users"
  ON public.professional_profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Professionals can insert own profile"
  ON public.professional_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Professionals can update own profile"
  ON public.professional_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ─── client_profiles ─────────────────────────────────────────
CREATE POLICY "Client profiles viewable by authenticated users"
  ON public.client_profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Clients can insert own profile"
  ON public.client_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Clients can update own profile"
  ON public.client_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ─── opportunities ───────────────────────────────────────────
CREATE POLICY "Opportunities viewable by authenticated users"
  ON public.opportunities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Clients can insert opportunities"
  ON public.opportunities FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can update own opportunities"
  ON public.opportunities FOR UPDATE TO authenticated
  USING (auth.uid() = client_id);

-- ─── matches ─────────────────────────────────────────────────
CREATE POLICY "Professionals can view own matches"
  ON public.matches FOR SELECT TO authenticated
  USING (auth.uid() = professional_id);

CREATE POLICY "Clients can view matches for their opportunities"
  ON public.matches FOR SELECT TO authenticated
  USING (
    opportunity_id IN (
      SELECT id FROM opportunities WHERE client_id = auth.uid()
    )
  );

CREATE POLICY "Professionals can update own matches"
  ON public.matches FOR UPDATE TO authenticated
  USING (auth.uid() = professional_id);

CREATE POLICY "Service role can insert matches"
  ON public.matches FOR INSERT
  WITH CHECK (true);
