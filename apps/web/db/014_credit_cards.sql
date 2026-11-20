-- Migration 014: Credit Cards & Invoice Cycles

CREATE TABLE IF NOT EXISTS public.kc_credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name VARCHAR(90) NOT NULL,
  limit_cents BIGINT NOT NULL CHECK (limit_cents >= 0),
  closing_day INTEGER NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  default_wallet_id UUID,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id, user_id),
  FOREIGN KEY (default_wallet_id, user_id) REFERENCES public.kc_wallets(id, user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS kc_credit_cards_user_idx ON public.kc_credit_cards(user_id, archived_at, created_at);

ALTER TABLE public.kc_titles
  ADD COLUMN IF NOT EXISTS credit_card_id UUID,
  ADD COLUMN IF NOT EXISTS invoice_month CHAR(7) CHECK (invoice_month IS NULL OR invoice_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kc_titles_credit_card_fk'
  ) THEN
    ALTER TABLE public.kc_titles
      ADD CONSTRAINT kc_titles_credit_card_fk
      FOREIGN KEY (credit_card_id, user_id) REFERENCES public.kc_credit_cards(id, user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS kc_titles_user_card_invoice_idx
  ON public.kc_titles(user_id, credit_card_id, invoice_month)
  WHERE credit_card_id IS NOT NULL;

REVOKE ALL ON TABLE public.kc_credit_cards FROM PUBLIC;
