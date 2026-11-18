-- 005: Stable category identities and monthly category budgets.
-- Additive, idempotent migration; never deletes or alters historical transactions.

ALTER TABLE public.kc_categories
  ADD COLUMN IF NOT EXISTS canonical_key VARCHAR(80),
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kc_categories_id_user_unique'
  ) THEN
    ALTER TABLE public.kc_categories
      ADD CONSTRAINT kc_categories_id_user_unique UNIQUE (id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kc_categories_parent_fk'
  ) THEN
    ALTER TABLE public.kc_categories
      ADD CONSTRAINT kc_categories_parent_fk
      FOREIGN KEY (parent_id, user_id) REFERENCES public.kc_categories(id, user_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS kc_categories_canonical_idx
  ON public.kc_categories(user_id, direction, canonical_key)
  WHERE canonical_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.kc_budget_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  category_id UUID NOT NULL,
  limit_cents BIGINT NOT NULL CHECK (limit_cents >= 0),
  starts_month CHAR(7) NOT NULL CHECK (starts_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ends_month CHAR(7) CHECK (ends_month IS NULL OR (ends_month ~ '^\d{4}-(0[1-9]|1[0-2])$' AND ends_month >= starts_month)),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (category_id, user_id) REFERENCES public.kc_categories(id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS kc_budget_rules_active_cat_idx
  ON public.kc_budget_rules(user_id, category_id)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.kc_budget_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  category_id UUID NOT NULL,
  month CHAR(7) NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  limit_cents BIGINT NOT NULL CHECK (limit_cents >= 0),
  source_rule_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id, month),
  FOREIGN KEY (category_id, user_id) REFERENCES public.kc_categories(id, user_id),
  FOREIGN KEY (source_rule_id, user_id) REFERENCES public.kc_budget_rules(id, user_id)
);

CREATE INDEX IF NOT EXISTS kc_budget_periods_user_month_idx
  ON public.kc_budget_periods(user_id, month, category_id);

-- Atomic budget rule + current-month period upsert with optimistic version lock.
-- Never rewrites closed past months.
CREATE OR REPLACE FUNCTION public.kc_upsert_budget_rule(
  p_user_id TEXT,
  p_category_id UUID,
  p_limit_cents BIGINT,
  p_month CHAR(7),
  p_active BOOLEAN DEFAULT true,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cat public.kc_categories%ROWTYPE;
  v_rule_id UUID;
  v_period public.kc_budget_periods%ROWTYPE;
  v_new_version INTEGER := 1;
BEGIN
  IF p_user_id IS NULL OR p_category_id IS NULL OR p_month IS NULL
     OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
     OR (p_active AND (p_limit_cents IS NULL OR p_limit_cents < 0)) THEN
    RAISE EXCEPTION 'Dados de orçamento inválidos' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cat
  FROM public.kc_categories
  WHERE id = p_category_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_cat.direction <> 'expense' OR v_cat.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Orçamento mensal é permitido apenas em categoria principal de despesa' USING ERRCODE = '22023';
  END IF;

  IF NOT p_active THEN
    UPDATE public.kc_budget_rules
    SET active = false, ends_month = p_month, updated_at = now()
    WHERE user_id = p_user_id AND category_id = p_category_id AND active = true;
    DELETE FROM public.kc_budget_periods
    WHERE user_id = p_user_id AND category_id = p_category_id AND month >= p_month;
    RETURN jsonb_build_object('category_id', p_category_id, 'month', p_month, 'active', false);
  END IF;

  SELECT * INTO v_period
  FROM public.kc_budget_periods
  WHERE user_id = p_user_id AND category_id = p_category_id AND month = p_month
  FOR UPDATE;

  IF FOUND AND p_expected_version IS NOT NULL AND v_period.version <> p_expected_version THEN
    RAISE EXCEPTION 'Orçamento foi alterado por outra sessão. Atualize antes de salvar.' USING ERRCODE = '40001';
  END IF;

  SELECT id INTO v_rule_id
  FROM public.kc_budget_rules
  WHERE user_id = p_user_id AND category_id = p_category_id AND active = true
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.kc_budget_rules
    SET limit_cents = p_limit_cents, updated_at = now()
    WHERE id = v_rule_id AND user_id = p_user_id;
  ELSE
    INSERT INTO public.kc_budget_rules(user_id, category_id, limit_cents, starts_month, active)
    VALUES (p_user_id, p_category_id, p_limit_cents, p_month, true)
    RETURNING id INTO v_rule_id;
  END IF;

  IF FOUND AND v_period.id IS NOT NULL THEN
    v_new_version := v_period.version + 1;
    UPDATE public.kc_budget_periods
    SET limit_cents = p_limit_cents, source_rule_id = v_rule_id, version = v_new_version, updated_at = now()
    WHERE id = v_period.id AND user_id = p_user_id;
  ELSE
    INSERT INTO public.kc_budget_periods(user_id, category_id, month, limit_cents, source_rule_id, version)
    VALUES (p_user_id, p_category_id, p_month, p_limit_cents, v_rule_id, 1);
  END IF;

  RETURN jsonb_build_object(
    'rule_id', v_rule_id,
    'category_id', p_category_id,
    'month', p_month,
    'limit_cents', p_limit_cents,
    'version', v_new_version,
    'active', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_upsert_budget_rule(TEXT, UUID, BIGINT, CHAR(7), BOOLEAN, INTEGER) FROM PUBLIC;
