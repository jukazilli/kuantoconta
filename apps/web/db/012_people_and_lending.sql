-- Migration 012: People registry (carteira de pessoas) and lending (empréstimos a terceiros)

CREATE TABLE IF NOT EXISTS public.kc_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name VARCHAR(120) NOT NULL,
  relationship VARCHAR(50) NOT NULL DEFAULT 'Outro',
  email VARCHAR(160),
  phone VARCHAR(40),
  notes VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id, user_id)
);

CREATE INDEX IF NOT EXISTS kc_people_user_name_idx ON public.kc_people(user_id, name);

ALTER TABLE public.kc_titles
  ADD COLUMN IF NOT EXISTS person_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kc_titles_person_fk'
  ) THEN
    ALTER TABLE public.kc_titles
      ADD CONSTRAINT kc_titles_person_fk
      FOREIGN KEY (person_id, user_id) REFERENCES public.kc_people(id, user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Expand entry_kind check on kc_titles to support loan_out and loan_repayment
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.kc_titles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%entry_kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.kc_titles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.kc_titles
  ADD CONSTRAINT kc_titles_entry_kind_check
  CHECK (entry_kind IN ('standard', 'reserve_transfer', 'debt_payment', 'capital_aporte', 'loan_out', 'loan_repayment'));

CREATE INDEX IF NOT EXISTS kc_titles_user_person_idx ON public.kc_titles(user_id, person_id) WHERE person_id IS NOT NULL;

REVOKE ALL ON TABLE public.kc_people FROM PUBLIC;
