-- Migration 010: Fix kc_upsert_budget_rule ends_month check when deactivating from an earlier month

CREATE OR REPLACE FUNCTION public.kc_upsert_budget_rule(
  p_user_id TEXT,
  p_category_id UUID,
  p_limit_cents BIGINT,
  p_month CHAR(7),
  p_active BOOLEAN DEFAULT true,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    SET active = false, ends_month = GREATEST(starts_month, p_month), updated_at = now()
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
