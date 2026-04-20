-- Create private storage bucket for CU action screenshots (ACTN-07).
-- Idempotent on re-apply thanks to INSERT ... ON CONFLICT DO NOTHING.
-- Signed URLs issued by the worker expire after 7 days.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'screenshots',
  'screenshots',
  false,
  10485760,  -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: only service role writes/reads screenshots. Users never touch the
-- bucket directly; they receive signed URLs from actions.screenshot_url.
-- (No explicit policies here — Supabase storage defaults deny anon/authenticated
-- unless policies opt in, which matches the intent.)
