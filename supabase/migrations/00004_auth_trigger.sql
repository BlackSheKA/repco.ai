-- =============================================================================
-- Migration: 00004_auth_trigger.sql
-- Purpose: Sync auth.users -> public.users on signup
-- Depends on: 00002_initial_schema.sql (users table)
-- =============================================================================

-- Create the trigger function with SECURITY DEFINER to bypass RLS
-- SET search_path = '' prevents search_path injection attacks
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;

-- Fire trigger after each new auth.users row is created
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
