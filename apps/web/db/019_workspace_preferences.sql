-- Migration 019: Desktop workspace column preferences per user

CREATE TABLE IF NOT EXISTS public.kc_user_preferences (
  user_id TEXT PRIMARY KEY,
  desktop_columns JSONB NOT NULL DEFAULT '["overview","movements","health"]'::jsonb,
  column_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
