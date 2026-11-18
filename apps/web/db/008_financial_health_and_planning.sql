-- kuantoconta migration 008 — ADR-009 financial health, debt contracts, liquidity reconciliation, goals, and hysteresis snapshots.
-- Additive and idempotent; preserves existing user data and ADR-008 invariants.

-- 1. Wallets: distinguish checking/cash vs reserve/investment and liquidity
ALTER TABLE public.kc_wallets
  ADD COLUMN IF NOT EXISTS wallet_kind VARCHAR(20) NOT NULL DEFAULT 'checking'
    CHECK (wallet_kind IN ('checking', 'cash', 'reserve', 'investment')),
  ADD COLUMN IF NOT EXISTS liquidity_kind VARCHAR(20) NOT NULL DEFAULT 'immediate'
    CHECK (liquidity_kind IN ('immediate', 'd_plus', 'locked')),
  ADD COLUMN IF NOT EXISTS is_reserved BOOLEAN NOT NULL DEFAULT false;

-- 2. Assets: distinguish property/investment/reserve and link to wallet to prevent double counting
ALTER TABLE public.kc_assets
  ADD COLUMN IF NOT EXISTS asset_kind VARCHAR(20) NOT NULL DEFAULT 'other'
    CHECK (asset_kind IN ('property', 'investment', 'reserve', 'other')),
  ADD COLUMN IF NOT EXISTS liquidity_kind VARCHAR(20) NOT NULL DEFAULT 'locked'
    CHECK (liquidity_kind IN ('immediate', 'd_plus', 'locked')),
  ADD COLUMN IF NOT EXISTS linked_wallet_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_assets_id_user_unique') THEN
    ALTER TABLE public.kc_assets ADD CONSTRAINT kc_assets_id_user_unique UNIQUE (id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_assets_linked_wallet_fk') THEN
    ALTER TABLE public.kc_assets
      ADD CONSTRAINT kc_assets_linked_wallet_fk
      FOREIGN KEY (linked_wallet_id, user_id) REFERENCES public.kc_wallets(id, user_id);
  END IF;
END $$;

-- 3. Liabilities: contract metadata (interest, CET, installments, status, series link)
ALTER TABLE public.kc_liabilities
  ADD COLUMN IF NOT EXISTS debt_kind VARCHAR(20) NOT NULL DEFAULT 'loan'
    CHECK (debt_kind IN ('loan', 'financing', 'credit_card', 'other')),
  ADD COLUMN IF NOT EXISTS interest_rate_bps INTEGER
    CHECK (interest_rate_bps IS NULL OR (interest_rate_bps >= 0 AND interest_rate_bps <= 100000)),
  ADD COLUMN IF NOT EXISTS cet_bps INTEGER
    CHECK (cet_bps IS NULL OR (cet_bps >= 0 AND cet_bps <= 200000)),
  ADD COLUMN IF NOT EXISTS monthly_installment_cents BIGINT
    CHECK (monthly_installment_cents IS NULL OR monthly_installment_cents >= 0),
  ADD COLUMN IF NOT EXISTS remaining_installments INTEGER
    CHECK (remaining_installments IS NULL OR remaining_installments >= 0),
  ADD COLUMN IF NOT EXISTS maturity_on DATE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled', 'renegotiated')),
  ADD COLUMN IF NOT EXISTS series_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_liabilities_id_user_unique') THEN
    ALTER TABLE public.kc_liabilities ADD CONSTRAINT kc_liabilities_id_user_unique UNIQUE (id, user_id);
  END IF;
END $$;

-- 4. Debt payments: separate principal amortization from interest/fees
CREATE TABLE IF NOT EXISTS public.kc_debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  liability_id UUID NOT NULL,
  wallet_id UUID,
  settlement_id UUID,
  principal_cents BIGINT NOT NULL CHECK (principal_cents >= 0),
  interest_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (interest_fee_cents >= 0),
  paid_on DATE NOT NULL,
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  FOREIGN KEY (liability_id, user_id) REFERENCES public.kc_liabilities(id, user_id),
  FOREIGN KEY (wallet_id, user_id) REFERENCES public.kc_wallets(id, user_id)
);

CREATE INDEX IF NOT EXISTS kc_debt_payments_user_liability_idx
  ON public.kc_debt_payments(user_id, liability_id, paid_on);

CREATE OR REPLACE FUNCTION public.kc_record_debt_payment(
  p_user_id TEXT,
  p_liability_id UUID,
  p_wallet_id UUID,
  p_principal_cents BIGINT,
  p_interest_fee_cents BIGINT,
  p_paid_on DATE,
  p_idempotency_key UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing UUID;
  v_liability public.kc_liabilities%ROWTYPE;
  v_applied_principal BIGINT;
  v_new_principal BIGINT;
  v_new_remaining INTEGER;
  v_new_status VARCHAR(20);
  v_payment_id UUID;
BEGIN
  IF p_principal_cents < 0 OR p_interest_fee_cents < 0 OR (p_principal_cents = 0 AND p_interest_fee_cents = 0) THEN
    RAISE EXCEPTION 'Pagamento de divida invalido' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing
  FROM public.kc_debt_payments
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('payment_id', v_existing, 'idempotent', true);
  END IF;

  SELECT * INTO v_liability
  FROM public.kc_liabilities
  WHERE id = p_liability_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Divida nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_applied_principal := LEAST(v_liability.principal_cents, p_principal_cents);
  v_new_principal := GREATEST(0, v_liability.principal_cents - v_applied_principal);
  v_new_remaining := CASE
    WHEN v_liability.remaining_installments IS NULL THEN NULL
    WHEN v_applied_principal > 0 AND v_liability.remaining_installments > 0 THEN v_liability.remaining_installments - 1
    ELSE v_liability.remaining_installments
  END;
  v_new_status := CASE WHEN v_new_principal = 0 THEN 'settled' ELSE v_liability.status END;

  UPDATE public.kc_liabilities
  SET principal_cents = v_new_principal,
      remaining_installments = v_new_remaining,
      status = v_new_status
  WHERE id = p_liability_id AND user_id = p_user_id;

  INSERT INTO public.kc_debt_payments (
    user_id, liability_id, wallet_id, principal_cents, interest_fee_cents, paid_on, idempotency_key
  ) VALUES (
    p_user_id, p_liability_id, p_wallet_id, v_applied_principal, p_interest_fee_cents, p_paid_on, p_idempotency_key
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'applied_principal_cents', v_applied_principal,
    'interest_fee_cents', p_interest_fee_cents,
    'remaining_principal_cents', v_new_principal,
    'status', v_new_status,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_record_debt_payment(TEXT, UUID, UUID, BIGINT, BIGINT, DATE, UUID) FROM PUBLIC;

-- 5. Categories: essential flag (provisional default heuristic on Moradia, Alimentacao, Saude)
ALTER TABLE public.kc_categories
  ADD COLUMN IF NOT EXISTS is_essential BOOLEAN NOT NULL DEFAULT false;

UPDATE public.kc_categories
SET is_essential = true
WHERE direction = 'expense'
  AND canonical_key IN ('expense.moradia', 'expense.alimentacao', 'expense.saude')
  AND is_essential = false;

-- 6. Titles & recurring rules: entry kind, essential override, income confidence, liability link
ALTER TABLE public.kc_titles
  ADD COLUMN IF NOT EXISTS is_essential BOOLEAN,
  ADD COLUMN IF NOT EXISTS income_confidence VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (income_confidence IN ('confirmed', 'recurring', 'variable')),
  ADD COLUMN IF NOT EXISTS entry_kind VARCHAR(24) NOT NULL DEFAULT 'standard'
    CHECK (entry_kind IN ('standard', 'reserve_transfer', 'debt_payment', 'capital_aporte')),
  ADD COLUMN IF NOT EXISTS liability_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_titles_liability_fk') THEN
    ALTER TABLE public.kc_titles
      ADD CONSTRAINT kc_titles_liability_fk
      FOREIGN KEY (liability_id, user_id) REFERENCES public.kc_liabilities(id, user_id);
  END IF;
END $$;

ALTER TABLE public.kc_recurring_rules
  ADD COLUMN IF NOT EXISTS is_essential BOOLEAN,
  ADD COLUMN IF NOT EXISTS income_confidence VARCHAR(20) NOT NULL DEFAULT 'recurring'
    CHECK (income_confidence IN ('confirmed', 'recurring', 'variable')),
  ADD COLUMN IF NOT EXISTS entry_kind VARCHAR(24) NOT NULL DEFAULT 'standard'
    CHECK (entry_kind IN ('standard', 'reserve_transfer', 'debt_payment', 'capital_aporte'));

-- 7. Financial goals & simulated purchase plans (never create real obligations until confirmed)
CREATE TABLE IF NOT EXISTS public.kc_financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title VARCHAR(120) NOT NULL,
  category VARCHAR(70),
  target_cents BIGINT NOT NULL CHECK (target_cents > 0),
  down_payment_cents BIGINT NOT NULL DEFAULT 0 CHECK (down_payment_cents >= 0 AND down_payment_cents <= target_cents),
  installment_count INTEGER NOT NULL DEFAULT 1 CHECK (installment_count >= 1 AND installment_count <= 120),
  installment_cents BIGINT NOT NULL DEFAULT 0 CHECK (installment_cents >= 0),
  interest_bps INTEGER NOT NULL DEFAULT 0 CHECK (interest_bps >= 0),
  desired_on DATE,
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  status VARCHAR(20) NOT NULL DEFAULT 'simulated'
    CHECK (status IN ('simulated', 'planned', 'paused', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS kc_financial_goals_user_status_idx
  ON public.kc_financial_goals(user_id, status, priority);

-- 8. Health state snapshots for hysteresis across days/sessions
CREATE TABLE IF NOT EXISTS public.kc_health_snapshots (
  user_id TEXT NOT NULL,
  as_of DATE NOT NULL,
  state VARCHAR(16) NOT NULL CHECK (state IN ('unknown', 'red', 'orange', 'blue', 'green')),
  policy_version VARCHAR(32) NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  stable_streak_months INTEGER NOT NULL DEFAULT 0 CHECK (stable_streak_months >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, as_of, policy_version)
);
