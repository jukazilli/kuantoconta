-- kuantoconta migration 009 — ADR-010 spending intentions (kc_spending_plans) and explicit reconciliation (kc_spending_plan_applications).
-- Additive and idempotent; preserves all ADR-008 and ADR-009 invariants and existing user data.

CREATE TABLE IF NOT EXISTS public.kc_spending_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  description VARCHAR(140) NOT NULL,
  category_id UUID NOT NULL,
  subcategory_id UUID,
  estimated_amount_cents BIGINT NOT NULL CHECK (estimated_amount_cents > 0),
  planned_for DATE,
  planned_month CHAR(7) NOT NULL CHECK (planned_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  expected_payment_on DATE,
  status VARCHAR(24) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'partially_fulfilled', 'fulfilled', 'cancelled')),
  source VARCHAR(24) NOT NULL DEFAULT 'user'
    CHECK (source IN ('user', 'suggested')),
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  UNIQUE (id, user_id),
  UNIQUE (user_id, idempotency_key),
  FOREIGN KEY (category_id, user_id) REFERENCES public.kc_categories(id, user_id),
  FOREIGN KEY (subcategory_id, user_id) REFERENCES public.kc_categories(id, user_id),
  CHECK (planned_for IS NULL OR to_char(planned_for, 'YYYY-MM') = planned_month)
);

CREATE INDEX IF NOT EXISTS kc_spending_plans_user_month_idx
  ON public.kc_spending_plans(user_id, planned_month, status);

CREATE INDEX IF NOT EXISTS kc_spending_plans_user_cat_idx
  ON public.kc_spending_plans(user_id, category_id, planned_month)
  WHERE status IN ('planned', 'partially_fulfilled');

CREATE TABLE IF NOT EXISTS public.kc_spending_plan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  plan_id UUID NOT NULL,
  economic_event_id UUID NOT NULL,
  allocated_cents BIGINT NOT NULL CHECK (allocated_cents > 0),
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (plan_id, economic_event_id),
  FOREIGN KEY (plan_id, user_id) REFERENCES public.kc_spending_plans(id, user_id),
  FOREIGN KEY (economic_event_id, user_id) REFERENCES public.kc_economic_events(id, user_id)
);

CREATE INDEX IF NOT EXISTS kc_spending_plan_apps_user_plan_idx
  ON public.kc_spending_plan_applications(user_id, plan_id);

CREATE INDEX IF NOT EXISTS kc_spending_plan_apps_user_event_idx
  ON public.kc_spending_plan_applications(user_id, economic_event_id);

CREATE OR REPLACE FUNCTION public.kc_create_spending_plan(
  p_user_id TEXT,
  p_description VARCHAR(140),
  p_category_id UUID,
  p_subcategory_id UUID,
  p_estimated_amount_cents BIGINT,
  p_planned_for DATE,
  p_planned_month CHAR(7),
  p_expected_payment_on DATE,
  p_idempotency_key UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing UUID;
  v_cat RECORD;
  v_month CHAR(7);
  v_plan_id UUID;
BEGIN
  IF p_estimated_amount_cents IS NULL OR p_estimated_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Valor estimado invalido' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing
  FROM public.kc_spending_plans
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('plan_id', v_existing, 'idempotent', true);
  END IF;

  SELECT id, direction, parent_id INTO v_cat
  FROM public.kc_categories
  WHERE id = p_category_id AND user_id = p_user_id;

  IF NOT FOUND OR v_cat.direction <> 'expense' OR v_cat.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Categoria de despesa invalida para plano' USING ERRCODE = '22023';
  END IF;

  v_month := COALESCE(
    CASE WHEN p_planned_for IS NOT NULL THEN to_char(p_planned_for, 'YYYY-MM') ELSE NULL END,
    p_planned_month
  );

  IF v_month IS NULL OR v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes previsto invalido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.kc_spending_plans (
    user_id, description, category_id, subcategory_id,
    estimated_amount_cents, planned_for, planned_month,
    expected_payment_on, status, source, idempotency_key
  ) VALUES (
    p_user_id, btrim(p_description), p_category_id, p_subcategory_id,
    p_estimated_amount_cents, p_planned_for, v_month,
    p_expected_payment_on, 'planned', 'user', p_idempotency_key
  )
  RETURNING id INTO v_plan_id;

  RETURN jsonb_build_object('plan_id', v_plan_id, 'planned_month', v_month, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_create_spending_plan(TEXT, VARCHAR, UUID, UUID, BIGINT, DATE, CHAR, DATE, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.kc_apply_event_to_spending_plan(
  p_user_id TEXT,
  p_plan_id UUID,
  p_economic_event_id UUID,
  p_allocated_cents BIGINT,
  p_close_plan BOOLEAN,
  p_idempotency_key UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing UUID;
  v_plan public.kc_spending_plans%ROWTYPE;
  v_event public.kc_economic_events%ROWTYPE;
  v_already_allocated_event BIGINT;
  v_apply_cents BIGINT;
  v_total_plan_allocated BIGINT;
  v_new_status VARCHAR(24);
  v_app_id UUID;
BEGIN
  SELECT id INTO v_existing
  FROM public.kc_spending_plan_applications
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('application_id', v_existing, 'idempotent', true);
  END IF;

  SELECT * INTO v_plan
  FROM public.kc_spending_plans
  WHERE id = p_plan_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano de gasto nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_plan.status IN ('cancelled', 'fulfilled') THEN
    RAISE EXCEPTION 'Plano de gasto ja encerrado ou cancelado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event
  FROM public.kc_economic_events
  WHERE id = p_economic_event_id AND user_id = p_user_id AND cancelled_at IS NULL;

  IF NOT FOUND OR v_event.direction <> 'expense' THEN
    RAISE EXCEPTION 'Despesa realizada invalida para conciliacao' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.category_id <> v_plan.category_id THEN
    RAISE EXCEPTION 'Categoria da compra diverge da categoria do plano' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(allocated_cents), 0) INTO v_already_allocated_event
  FROM public.kc_spending_plan_applications
  WHERE user_id = p_user_id AND economic_event_id = p_economic_event_id;

  v_apply_cents := COALESCE(p_allocated_cents, v_event.amount_cents - v_already_allocated_event);

  IF v_apply_cents <= 0 OR (v_already_allocated_event + v_apply_cents) > v_event.amount_cents THEN
    RAISE EXCEPTION 'Valor conciliado excede a despesa disponivel' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.kc_spending_plan_applications (
    user_id, plan_id, economic_event_id, allocated_cents, idempotency_key
  ) VALUES (
    p_user_id, p_plan_id, p_economic_event_id, v_apply_cents, p_idempotency_key
  )
  ON CONFLICT (plan_id, economic_event_id) DO NOTHING
  RETURNING id INTO v_app_id;

  IF v_app_id IS NULL THEN
    SELECT id INTO v_app_id
    FROM public.kc_spending_plan_applications
    WHERE plan_id = p_plan_id AND economic_event_id = p_economic_event_id;
    RETURN jsonb_build_object('application_id', v_app_id, 'idempotent', true);
  END IF;

  SELECT COALESCE(SUM(a.allocated_cents), 0) INTO v_total_plan_allocated
  FROM public.kc_spending_plan_applications a
  JOIN public.kc_economic_events e ON e.id = a.economic_event_id AND e.user_id = a.user_id
  WHERE a.user_id = p_user_id AND a.plan_id = p_plan_id AND e.cancelled_at IS NULL;

  IF COALESCE(p_close_plan, false) OR v_total_plan_allocated >= v_plan.estimated_amount_cents THEN
    v_new_status := 'fulfilled';
  ELSE
    v_new_status := 'partially_fulfilled';
  END IF;

  UPDATE public.kc_spending_plans
  SET status = v_new_status,
      updated_at = now()
  WHERE id = p_plan_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'application_id', v_app_id,
    'allocated_cents', v_apply_cents,
    'total_allocated_cents', v_total_plan_allocated,
    'remaining_cents', CASE WHEN v_new_status = 'fulfilled' THEN 0 ELSE GREATEST(0, v_plan.estimated_amount_cents - v_total_plan_allocated) END,
    'status', v_new_status,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_apply_event_to_spending_plan(TEXT, UUID, UUID, BIGINT, BOOLEAN, UUID) FROM PUBLIC;
