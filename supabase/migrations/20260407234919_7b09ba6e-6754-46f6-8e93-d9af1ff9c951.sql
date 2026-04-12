
CREATE TABLE public.ceseda_articles_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id text NOT NULL UNIQUE,
  article_title text NOT NULL,
  article_content text NOT NULL,
  source_url text,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ceseda_articles_cache ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read cached articles (public legal text)
CREATE POLICY "Authenticated users can read articles"
  ON public.ceseda_articles_cache FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role can write (edge function uses service role)
CREATE POLICY "Service role can manage articles"
  ON public.ceseda_articles_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
