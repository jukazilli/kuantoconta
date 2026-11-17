-- 006: Economic events separated from cash-flow titles and settlements.
-- Additive, idempotent migration; preserves all existing titles, settlements, and recurring rules.

CREATE TABLE IF NOT EXISTS public.kc_economic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  direction VARCHAR(7) NOT NULL CHECK (direction IN ('income', 'expense')),
  description VARCHAR(140) NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  occurred_on DATE NOT NULL,
  category_id UUID NOT NULL,
  subcategory_id UUID,
  event_kind VARCHAR(24) NOT NULL DEFAULT 'one_off'
    CHECK (event_kind IN ('one_off', 'installment_purchase', 'recurring_occurrence', 'refund')),
  competence_source VARCHAR(20) NOT NULL DEFAULT 'user_occurred_on'
    CHECK (competence_source IN ('user_occurred_on', 'legacy_inferred', 'recurring_rule')),
  status VARCHAR(16) NOT NULL DEFAULT 'committed'
    CHECK (status IN ('committed', 'cancelled')),
  recurring_rule_id UUID,
  parent_event_id UUID,
  idempotency_key UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  UNIQUE (id, user_id),
  FOREIGN KEY (category_id, user_id) REFERENCES public.kc_categories(id, user_id),
  FOREIGN KEY (subcategory_id, user_id) REFERENCES public.kc_categories(id, user_id),
  FOREIGN KEY (recurring_rule_id, user_id) REFERENCES public.kc_recurring_rules(id, user_id),
  FOREIGN KEY (parent_event_id, user_id) REFERENCES public.kc_economic_events(id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS kc_economic_events_idemp_idx
  ON public.kc_economic_events(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS kc_economic_events_budget_idx
  ON public.kc_economic_events(user_id, occurred_on, category_id)
  WHERE cancelled_at IS NULL;

ALTER TABLE public.kc_titles
  ADD COLUMN IF NOT EXISTS economic_event_id UUID,
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS subcategory_id UUID;

ALTER TABLE public.kc_recurring_rules
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS subcategory_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_titles_economic_event_fk') THEN
    ALTER TABLE public.kc_titles
      ADD CONSTRAINT kc_titles_economic_event_fk
      FOREIGN KEY (economic_event_id, user_id) REFERENCES public.kc_economic_events(id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_titles_category_fk') THEN
    ALTER TABLE public.kc_titles
      ADD CONSTRAINT kc_titles_category_fk
      FOREIGN KEY (category_id, user_id) REFERENCES public.kc_categories(id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_titles_subcategory_fk') THEN
    ALTER TABLE public.kc_titles
      ADD CONSTRAINT kc_titles_subcategory_fk
      FOREIGN KEY (subcategory_id, user_id) REFERENCES public.kc_categories(id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_recurring_category_fk') THEN
    ALTER TABLE public.kc_recurring_rules
      ADD CONSTRAINT kc_recurring_category_fk
      FOREIGN KEY (category_id, user_id) REFERENCES public.kc_categories(id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_recurring_subcategory_fk') THEN
    ALTER TABLE public.kc_recurring_rules
      ADD CONSTRAINT kc_recurring_subcategory_fk
      FOREIGN KEY (subcategory_id, user_id) REFERENCES public.kc_categories(id, user_id);
  END IF;
END $$;

-- Atomic, idempotent creation of economic event + title(s) + optional immediate settlement.
-- If any step fails, the entire transaction rolls back.
CREATE OR REPLACE FUNCTION public.kc_create_financial_event(
  p_user_id TEXT,
  p_wallet_id UUID,
  p_direction TEXT,
  p_description TEXT,
  p_category_id UUID,
  p_subcategory_id UUID,
  p_category_name TEXT,
  p_subcategory_name TEXT,
  p_amount_cents BIGINT,
  p_occurred_on DATE,
  p_due_on DATE,
  p_mode TEXT DEFAULT 'single',
  p_count INTEGER DEFAULT 1,
  p_start_index INTEGER DEFAULT 1,
  p_value_mode TEXT DEFAULT 'total',
  p_settlement_state TEXT DEFAULT 'pending',
  p_settled_on DATE DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_existing UUID;
  v_event_id UUID;
  v_title_id UUID;
  v_settlement_id UUID;
  v_series_id UUID;
  v_total_economic BIGINT;
  v_remaining_count INTEGER;
  v_floor BIGINT;
  v_rem BIGINT;
  v_idx INTEGER;
  v_inst_cents BIGINT;
  v_inst_due DATE;
  v_inst_desc TEXT;
BEGIN
  IF p_user_id IS NULL OR p_wallet_id IS NULL OR p_category_id IS NULL
     OR p_direction NOT IN ('income', 'expense')
     OR p_amount_cents IS NULL OR p_amount_cents <= 0
     OR p_occurred_on IS NULL OR p_due_on IS NULL
     OR p_mode NOT IN ('single', 'installments')
     OR p_settlement_state NOT IN ('paid', 'pending') THEN
    RAISE EXCEPTION 'Dados inválidos para lançamento financeiro' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.kc_economic_events
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('event_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.kc_wallets WHERE id = p_wallet_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Conta não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.kc_categories
    WHERE id = p_category_id AND user_id = p_user_id AND direction = p_direction AND parent_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Categoria inválida' USING ERRCODE = '22023';
  END IF;

  IF p_subcategory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.kc_categories
    WHERE id = p_subcategory_id AND user_id = p_user_id AND direction = p_direction AND parent_id = p_category_id
  ) THEN
    RAISE EXCEPTION 'Subcategoria inválida' USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'installments' AND p_settlement_state = 'paid' THEN
    RAISE EXCEPTION 'Compra parcelada deve ser registrada como pendente para baixa por parcela' USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'single' THEN
    INSERT INTO public.kc_economic_events(
      user_id, direction, description, amount_cents, occurred_on,
      category_id, subcategory_id, event_kind, competence_source, idempotency_key
    ) VALUES (
      p_user_id, p_direction, p_description, p_amount_cents, p_occurred_on,
      p_category_id, p_subcategory_id, 'one_off', 'user_occurred_on', p_idempotency_key
    ) RETURNING id INTO v_event_id;

    INSERT INTO public.kc_titles(
      user_id, wallet_id, direction, description, category, subcategory,
      category_id, subcategory_id, economic_event_id,
      amount_cents, due_on, recurrence, installment_index, installment_total
    ) VALUES (
      p_user_id, p_wallet_id, p_direction, p_description, p_category_name, p_subcategory_name,
      p_category_id, p_subcategory_id, v_event_id,
      p_amount_cents, p_due_on, 'single', 1, 1
    ) RETURNING id INTO v_title_id;

    IF p_settlement_state = 'paid' THEN
      IF p_settled_on IS NULL THEN
        RAISE EXCEPTION 'Informe a data do pagamento' USING ERRCODE = '22023';
      END IF;
      v_settlement_id := public.kc_settle_title(
        p_user_id, v_title_id, p_amount_cents, p_settled_on,
        COALESCE(p_idempotency_key, gen_random_uuid())
      );
    END IF;

    RETURN jsonb_build_object(
      'event_id', v_event_id,
      'title_id', v_title_id,
      'settlement_id', v_settlement_id,
      'count', 1,
      'idempotent_replay', false
    );
  END IF;

  -- Installment purchase: 1 economic event + N titles
  IF p_count < 2 OR p_count > 60 OR p_start_index < 1 OR p_start_index > p_count THEN
    RAISE EXCEPTION 'Parcelamento inválido' USING ERRCODE = '22023';
  END IF;

  v_remaining_count := p_count - p_start_index + 1;
  IF p_value_mode = 'installment' THEN
    v_total_economic := p_amount_cents * v_remaining_count;
  ELSE
    IF p_amount_cents < p_count THEN
      RAISE EXCEPTION 'Valor total insuficiente para o número de parcelas' USING ERRCODE = '22023';
    END IF;
    v_floor := p_amount_cents / p_count;
    v_rem := p_amount_cents % p_count;
    v_total_economic := 0;
    FOR v_idx IN p_start_index..p_count LOOP
      v_total_economic := v_total_economic + v_floor + (CASE WHEN v_idx <= v_rem THEN 1 ELSE 0 END);
    END LOOP;
  END IF;

  INSERT INTO public.kc_economic_events(
    user_id, direction, description, amount_cents, occurred_on,
    category_id, subcategory_id, event_kind, competence_source, idempotency_key
  ) VALUES (
    p_user_id, p_direction, p_description, v_total_economic, p_occurred_on,
    p_category_id, p_subcategory_id, 'installment_purchase', 'user_occurred_on', p_idempotency_key
  ) RETURNING id INTO v_event_id;

  v_series_id := gen_random_uuid();
  v_floor := p_amount_cents / p_count;
  v_rem := p_amount_cents % p_count;

  FOR v_idx IN p_start_index..p_count LOOP
    v_inst_cents := CASE WHEN p_value_mode = 'installment' THEN p_amount_cents
                         ELSE v_floor + (CASE WHEN v_idx <= v_rem THEN 1 ELSE 0 END) END;
    v_inst_due := least(
      (date_trunc('month', p_due_on)::date + ((v_idx - p_start_index) || ' months')::interval
        + (extract(day from p_due_on)::int - 1) * interval '1 day')::date,
      (date_trunc('month', p_due_on)::date + ((v_idx - p_start_index + 1) || ' months')::interval
        - interval '1 day')::date
    );
    v_inst_desc := p_description || ' (' || v_idx || '/' || p_count || ')';

    INSERT INTO public.kc_titles(
      user_id, wallet_id, direction, description, category, subcategory,
      category_id, subcategory_id, economic_event_id,
      amount_cents, due_on, recurrence, series_id, installment_index, installment_total
    ) VALUES (
      p_user_id, p_wallet_id, p_direction, v_inst_desc, p_category_name, p_subcategory_name,
      p_category_id, p_subcategory_id, v_event_id,
      v_inst_cents, v_inst_due, 'installments', v_series_id, v_idx, p_count
    );
  END LOOP;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'series_id', v_series_id,
    'count', v_remaining_count,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_create_financial_event(
  TEXT, UUID, TEXT, TEXT, UUID, UUID, TEXT, TEXT, BIGINT, DATE, DATE, TEXT, INTEGER, INTEGER, TEXT, TEXT, DATE, UUID
) FROM PUBLIC;

-- Deterministic dry-run/apply backfill for legacy titles without economic_event_id.
CREATE OR REPLACE FUNCTION public.kc_backfill_legacy_economic_events(
  p_user_id TEXT,
  p_dry_run BOOLEAN DEFAULT true
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_single_count INTEGER := 0;
  v_series_count INTEGER := 0;
  v_row RECORD;
  v_cat_id UUID;
  v_sub_id UUID;
  v_event_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_single_count
  FROM public.kc_titles
  WHERE user_id = p_user_id AND economic_event_id IS NULL AND cancelled_at IS NULL AND series_id IS NULL;

  SELECT count(DISTINCT series_id) INTO v_series_count
  FROM public.kc_titles
  WHERE user_id = p_user_id AND economic_event_id IS NULL AND cancelled_at IS NULL AND series_id IS NOT NULL;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'pending_single_titles', v_single_count,
      'pending_series', v_series_count
    );
  END IF;

  FOR v_row IN
    SELECT * FROM public.kc_titles
    WHERE user_id = p_user_id AND economic_event_id IS NULL AND cancelled_at IS NULL AND series_id IS NULL
    FOR UPDATE
  LOOP
    SELECT id INTO v_cat_id FROM public.kc_categories
    WHERE user_id = p_user_id AND direction = v_row.direction AND parent_id IS NULL AND lower(name) = lower(v_row.category) LIMIT 1;
    IF v_cat_id IS NULL THEN
      INSERT INTO public.kc_categories(user_id, name, direction)
      VALUES (p_user_id, v_row.category, v_row.direction)
      ON CONFLICT (user_id, name, direction) DO NOTHING;
      SELECT id INTO v_cat_id FROM public.kc_categories
      WHERE user_id = p_user_id AND direction = v_row.direction AND parent_id IS NULL AND lower(name) = lower(v_row.category) LIMIT 1;
    END IF;

    v_sub_id := NULL;
    IF v_row.subcategory IS NOT NULL THEN
      SELECT id INTO v_sub_id FROM public.kc_categories
      WHERE user_id = p_user_id AND direction = v_row.direction AND parent_id = v_cat_id AND lower(name) = lower(v_row.subcategory) LIMIT 1;
    END IF;

    INSERT INTO public.kc_economic_events(
      user_id, direction, description, amount_cents, occurred_on,
      category_id, subcategory_id, event_kind, competence_source
    ) VALUES (
      p_user_id, v_row.direction, v_row.description, v_row.amount_cents, v_row.due_on,
      v_cat_id, v_sub_id, 'one_off', 'legacy_inferred'
    ) RETURNING id INTO v_event_id;

    UPDATE public.kc_titles
    SET economic_event_id = v_event_id, category_id = v_cat_id, subcategory_id = v_sub_id
    WHERE id = v_row.id AND user_id = p_user_id;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', false,
    'migrated_single_titles', v_single_count,
    'remaining_series', v_series_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_backfill_legacy_economic_events(TEXT, BOOLEAN) FROM PUBLIC;
