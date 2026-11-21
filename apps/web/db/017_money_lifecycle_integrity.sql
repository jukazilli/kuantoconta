-- 017: Integridade do ciclo de vida do dinheiro, cartões em objetivos e sincronia de baixas/passivos/eventos

-- 1. Objetivos / Planejamentos: suporte a cartão de crédito como meio de pagamento simulado
ALTER TABLE public.kc_financial_goals
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(24) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS credit_card_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_payment_method_check') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_payment_method_check
      CHECK (payment_method IN ('standard', 'credit_card'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_credit_card_fk') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_credit_card_fk
      FOREIGN KEY (credit_card_id, user_id) REFERENCES public.kc_credit_cards(id, user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Sincroniza edições de lançamentos (incluindo parcelamentos, data de baixa única, valor quitado e mês da fatura)
CREATE OR REPLACE FUNCTION public.kc_edit_title_and_event(
  p_user_id TEXT,
  p_title_id UUID,
  p_wallet_id UUID,
  p_direction TEXT,
  p_description TEXT,
  p_category_id UUID,
  p_subcategory_id UUID,
  p_category_name TEXT,
  p_subcategory_name TEXT,
  p_amount_cents BIGINT,
  p_due_on DATE,
  p_occurred_on DATE DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_title public.kc_titles%ROWTYPE;
  v_event public.kc_economic_events%ROWTYPE;
  v_active_settlement_count INTEGER := 0;
  v_active_settlement_id UUID;
  v_next_settled_cents BIGINT;
  v_next_settled_on DATE;
  v_active_sum BIGINT := 0;
  v_today_br DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO v_title
  FROM public.kc_titles
  WHERE id = p_title_id AND user_id = p_user_id AND direction = p_direction AND cancelled_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Título não encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_next_settled_cents := v_title.settled_cents;

  -- Se o lançamento estava integralmente baixado em uma única baixa ativa, mantém valor e data sincronizados
  IF v_title.settled_cents > 0 AND v_title.settled_cents = v_title.amount_cents THEN
    SELECT COUNT(*) INTO v_active_settlement_count
    FROM public.kc_settlements
    WHERE user_id = p_user_id AND title_id = p_title_id AND reversed_at IS NULL;

    IF v_active_settlement_count = 1 THEN
      IF v_title.wallet_id <> p_wallet_id THEN
        RAISE EXCEPTION 'A conta de um título com baixa não pode ser alterada' USING ERRCODE = '22023';
      END IF;
      SELECT id INTO v_active_settlement_id
      FROM public.kc_settlements
      WHERE user_id = p_user_id AND title_id = p_title_id AND reversed_at IS NULL
      LIMIT 1;
      v_next_settled_on := LEAST(COALESCE(p_occurred_on, p_due_on), v_today_br);
      UPDATE public.kc_settlements
      SET amount_cents = p_amount_cents,
          settled_on = v_next_settled_on
      WHERE id = v_active_settlement_id AND user_id = p_user_id;
      v_next_settled_cents := p_amount_cents;
    ELSE
      IF v_title.settled_cents > p_amount_cents THEN
        RAISE EXCEPTION 'O valor não pode ficar abaixo do que já foi baixado' USING ERRCODE = '22023';
      END IF;
      IF v_title.wallet_id <> p_wallet_id THEN
        RAISE EXCEPTION 'A conta de um título com baixa não pode ser alterada' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    IF v_title.settled_cents > p_amount_cents THEN
      RAISE EXCEPTION 'O valor não pode ficar abaixo do que já foi baixado' USING ERRCODE = '22023';
    END IF;
    IF v_title.settled_cents > 0 AND v_title.wallet_id <> p_wallet_id THEN
      RAISE EXCEPTION 'A conta de um título com baixa não pode ser alterada' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.kc_titles
  SET wallet_id = p_wallet_id,
      description = p_description,
      category = p_category_name,
      subcategory = p_subcategory_name,
      category_id = p_category_id,
      subcategory_id = p_subcategory_id,
      amount_cents = p_amount_cents,
      settled_cents = v_next_settled_cents,
      due_on = p_due_on,
      invoice_month = CASE WHEN credit_card_id IS NOT NULL THEN to_char(p_due_on, 'YYYY-MM') ELSE invoice_month END
  WHERE id = p_title_id AND user_id = p_user_id;

  IF v_title.economic_event_id IS NOT NULL THEN
    SELECT * INTO v_event
    FROM public.kc_economic_events
    WHERE id = v_title.economic_event_id AND user_id = p_user_id AND cancelled_at IS NULL
    FOR UPDATE;
    IF FOUND THEN
      SELECT COALESCE(SUM(amount_cents), 0) INTO v_active_sum
      FROM public.kc_titles
      WHERE user_id = p_user_id AND economic_event_id = v_event.id AND cancelled_at IS NULL;

      IF v_event.event_kind = 'one_off' THEN
        UPDATE public.kc_economic_events
        SET description = p_description,
            category_id = p_category_id,
            subcategory_id = p_subcategory_id,
            amount_cents = v_active_sum,
            occurred_on = COALESCE(p_occurred_on, occurred_on),
            updated_at = now()
        WHERE id = v_event.id AND user_id = p_user_id;
      ELSE
        UPDATE public.kc_economic_events
        SET category_id = p_category_id,
            subcategory_id = p_subcategory_id,
            amount_cents = v_active_sum,
            updated_at = now()
        WHERE id = v_event.id AND user_id = p_user_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('saved', true, 'title_id', p_title_id, 'economic_event_id', v_title.economic_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_edit_title_and_event(
  TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, TEXT, TEXT, BIGINT, DATE, DATE
) FROM PUBLIC;

-- 3. Fecha o passivo em kc_liabilities quando todas as parcelas de empréstimo forem excluídas
CREATE OR REPLACE FUNCTION public.kc_cancel_title_scope(
  p_user_id TEXT, p_title_id UUID, p_scope TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_anchor public.kc_titles%ROWTYPE;
  v_count INTEGER := 0;
  v_amount BIGINT := 0;
  v_protected INTEGER := 0;
  v_liab_pending BIGINT := 0;
BEGIN
  IF p_scope NOT IN ('only', 'future', 'all') OR p_scope IS NULL THEN
    RAISE EXCEPTION 'Escopo de exclusão inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_anchor FROM public.kc_titles
  WHERE user_id = p_user_id AND id = p_title_id AND cancelled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Título não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_anchor.series_id IS NULL AND p_scope <> 'only' THEN
    RAISE EXCEPTION 'Este título não possui série' USING ERRCODE = '22023';
  END IF;
  IF v_anchor.series_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || v_anchor.series_id::text, 0));
  END IF;

  SELECT * INTO v_anchor FROM public.kc_titles
  WHERE user_id = p_user_id AND id = p_title_id AND cancelled_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Título já cancelado' USING ERRCODE = 'P0002'; END IF;

  PERFORM id FROM public.kc_titles WHERE user_id = p_user_id AND cancelled_at IS NULL
  AND (CASE WHEN p_scope = 'only' OR v_anchor.series_id IS NULL THEN id = p_title_id
            ELSE series_id = v_anchor.series_id AND
              (p_scope = 'all' OR installment_index >= v_anchor.installment_index) END)
  ORDER BY id FOR UPDATE;

  SELECT coalesce(sum(amount_cents - settled_cents), 0), count(*) FILTER (WHERE settled_cents = amount_cents)
  INTO v_amount, v_protected
  FROM public.kc_titles WHERE user_id = p_user_id AND cancelled_at IS NULL
  AND (CASE WHEN p_scope = 'only' OR v_anchor.series_id IS NULL THEN id = p_title_id
            ELSE series_id = v_anchor.series_id AND
              (p_scope = 'all' OR installment_index >= v_anchor.installment_index) END);

  IF p_scope = 'only' AND v_amount = 0 THEN
    RAISE EXCEPTION 'Título totalmente baixado: reverta a baixa antes de excluir somente este' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.kc_title_cancellation_events
  (user_id, title_id, scope, original_amount_cents, paid_cents, cancelled_pending_cents)
  SELECT user_id, id, p_scope, amount_cents, settled_cents, amount_cents - settled_cents
  FROM public.kc_titles WHERE user_id = p_user_id AND cancelled_at IS NULL
  AND amount_cents > settled_cents
  AND (CASE WHEN p_scope = 'only' OR v_anchor.series_id IS NULL THEN id = p_title_id
            ELSE series_id = v_anchor.series_id AND
              (p_scope = 'all' OR installment_index >= v_anchor.installment_index) END);

  UPDATE public.kc_titles
  SET cancelled_at = CASE WHEN settled_cents = 0 THEN now() ELSE cancelled_at END,
      amount_cents = CASE WHEN settled_cents > 0 THEN settled_cents ELSE amount_cents END
  WHERE user_id = p_user_id AND cancelled_at IS NULL AND amount_cents > settled_cents
  AND (CASE WHEN p_scope = 'only' OR v_anchor.series_id IS NULL THEN id = p_title_id
            ELSE series_id = v_anchor.series_id AND
              (p_scope = 'all' OR installment_index >= v_anchor.installment_index) END);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_anchor.liability_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount_cents - settled_cents), 0) INTO v_liab_pending
    FROM public.kc_titles
    WHERE user_id = p_user_id
      AND liability_id = v_anchor.liability_id
      AND direction = 'expense'
      AND cancelled_at IS NULL;

    IF v_liab_pending = 0 THEN
      UPDATE public.kc_liabilities
      SET principal_cents = 0,
          remaining_installments = 0,
          status = 'settled'
      WHERE id = v_anchor.liability_id AND user_id = p_user_id AND status <> 'settled';
    END IF;
  END IF;

  RETURN jsonb_build_object('affected', v_count, 'cancelled_pending_cents', v_amount, 'preserved_paid', v_protected, 'scope', p_scope);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_cancel_title_scope(TEXT, UUID, TEXT) FROM PUBLIC;
