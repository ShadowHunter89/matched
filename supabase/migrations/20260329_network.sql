-- ─── Migration: The Network ──────────────────────────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor

-- ─── 1. Knowledge Wall + Ask the Network posts ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.network_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type       text NOT NULL CHECK (type IN ('insight', 'question')),
  content    text NOT NULL CHECK (char_length(content) <= 1000),
  tags       text[] NOT NULL DEFAULT '{}',
  like_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.network_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "np_select" ON public.network_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "np_insert" ON public.network_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "np_delete" ON public.network_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── 2. Post likes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.network_post_likes (
  post_id uuid REFERENCES public.network_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.network_post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npl_select" ON public.network_post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "npl_insert" ON public.network_post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "npl_delete" ON public.network_post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── 3. Answers to questions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.network_answers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid REFERENCES public.network_posts(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content    text NOT NULL CHECK (char_length(content) <= 800),
  like_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.network_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "na_select" ON public.network_answers FOR SELECT TO authenticated USING (true);
CREATE POLICY "na_insert" ON public.network_answers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "na_delete" ON public.network_answers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── 4. Answer likes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.network_answer_likes (
  answer_id uuid REFERENCES public.network_answers(id) ON DELETE CASCADE NOT NULL,
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (answer_id, user_id)
);

ALTER TABLE public.network_answer_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nal_select" ON public.network_answer_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "nal_insert" ON public.network_answer_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nal_delete" ON public.network_answer_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── 5. Availability board ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.availability_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hours_per_week integer,
  available_from date,
  description    text CHECK (char_length(description) <= 400),
  skills         text[] NOT NULL DEFAULT '{}',
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ap_select" ON public.availability_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "ap_insert" ON public.availability_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ap_update" ON public.availability_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ap_delete" ON public.availability_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── 6. Skill challenges ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text NOT NULL,
  category    text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voting', 'closed')),
  ends_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ch_select" ON public.challenges FOR SELECT TO authenticated USING (true);

-- ─── 7. Challenge submissions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content      text NOT NULL CHECK (char_length(content) <= 1500),
  vote_count   integer NOT NULL DEFAULT 0,
  is_featured  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

ALTER TABLE public.challenge_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_select" ON public.challenge_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_insert" ON public.challenge_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ─── 8. Challenge votes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_votes (
  submission_id uuid REFERENCES public.challenge_submissions(id) ON DELETE CASCADE NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (submission_id, user_id)
);

ALTER TABLE public.challenge_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cv_select" ON public.challenge_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "cv_insert" ON public.challenge_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cv_delete" ON public.challenge_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── RPCs ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE liked boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM network_post_likes WHERE post_id=p_post_id AND user_id=auth.uid()) INTO liked;
  IF liked THEN
    DELETE FROM network_post_likes WHERE post_id=p_post_id AND user_id=auth.uid();
    UPDATE network_posts SET like_count=GREATEST(like_count-1,0) WHERE id=p_post_id;
    RETURN false;
  ELSE
    INSERT INTO network_post_likes(post_id,user_id) VALUES(p_post_id,auth.uid()) ON CONFLICT DO NOTHING;
    UPDATE network_posts SET like_count=like_count+1 WHERE id=p_post_id;
    RETURN true;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.toggle_answer_like(p_answer_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE liked boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM network_answer_likes WHERE answer_id=p_answer_id AND user_id=auth.uid()) INTO liked;
  IF liked THEN
    DELETE FROM network_answer_likes WHERE answer_id=p_answer_id AND user_id=auth.uid();
    UPDATE network_answers SET like_count=GREATEST(like_count-1,0) WHERE id=p_answer_id;
    RETURN false;
  ELSE
    INSERT INTO network_answer_likes(answer_id,user_id) VALUES(p_answer_id,auth.uid()) ON CONFLICT DO NOTHING;
    UPDATE network_answers SET like_count=like_count+1 WHERE id=p_answer_id;
    RETURN true;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.toggle_challenge_vote(p_submission_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE voted boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM challenge_votes WHERE submission_id=p_submission_id AND user_id=auth.uid()) INTO voted;
  IF voted THEN
    DELETE FROM challenge_votes WHERE submission_id=p_submission_id AND user_id=auth.uid();
    UPDATE challenge_submissions SET vote_count=GREATEST(vote_count-1,0) WHERE id=p_submission_id;
    RETURN false;
  ELSE
    INSERT INTO challenge_votes(submission_id,user_id) VALUES(p_submission_id,auth.uid()) ON CONFLICT DO NOTHING;
    UPDATE challenge_submissions SET vote_count=vote_count+1 WHERE id=p_submission_id;
    RETURN true;
  END IF;
END; $$;

-- ─── Seed: first challenge ───────────────────────────────────────────────────
INSERT INTO public.challenges (title, description, category, status, ends_at)
SELECT
  'Structure the finance function for a 20-person SaaS company',
  'A B2B SaaS company has grown from 5 to 20 employees. They are at $2M ARR, have raised a seed round, and are preparing for Series A. Currently the founder handles all finance decisions. How would you structure the finance function for the next 18 months — what to hire, what to outsource, and what systems to put in place?',
  'Finance',
  'active',
  now() + interval '30 days'
WHERE NOT EXISTS (SELECT 1 FROM public.challenges);
