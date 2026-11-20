-- Migration 015: Internal Wallet Transfers between Accounts
-- Expands entry_kind to support 'transfer' and links counterpart titles via transfer_id

ALTER TABLE public.kc_titles
  ADD COLUMN IF NOT EXISTS transfer_id UUID;

CREATE INDEX IF NOT EXISTS kc_titles_transfer_id_idx
  ON public.kc_titles(user_id, transfer_id)
  WHERE transfer_id IS NOT NULL;

-- Expand entry_kind check on public.kc_titles
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
  CHECK (entry_kind IN ('standard', 'reserve_transfer', 'debt_payment', 'capital_aporte', 'loan_out', 'loan_repayment', 'transfer'));

-- Expand entry_kind check on public.kc_recurring_rules (if exists)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.kc_recurring_rules'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%entry_kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.kc_recurring_rules DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.kc_recurring_rules
  ADD CONSTRAINT kc_recurring_rules_entry_kind_check
  CHECK (entry_kind IN ('standard', 'reserve_transfer', 'debt_payment', 'capital_aporte', 'loan_out', 'loan_repayment', 'transfer'));
