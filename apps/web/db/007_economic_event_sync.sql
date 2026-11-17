-- 007: Atomic synchronization between title edits/cancellations and economic events.
-- Additive, idempotent; preserves realized settlements and audit history.

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
BEGIN
  SELECT * INTO v_title
  FROM public.kc_titles
  WHERE id = p_title_id AND user_id = p_user_id AND direction = p_direction AND cancelled_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Título não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_title.settled_cents > p_amount_cents THEN
    RAISE EXCEPTION 'O valor não pode ficar abaixo do que já foi baixado' USING ERRCODE = '22023';
  END IF;

  IF v_title.settled_cents > 0 AND v_title.wallet_id <> p_wallet_id THEN
    RAISE EXCEPTION 'A conta de um título com baixa não pode ser alterada' USING ERRCODE = '22023';
  END IF;

  UPDATE public.kc_titles
  SET wallet_id = p_wallet_id,
      description = p_description,
      category = p_category_name,
      subcategory = p_subcategory_name,
      category_id = p_category_id,
      subcategory_id = p_subcategory_id,
      amount_cents = p_amount_cents,
      due_on = p_due_on
  WHERE id = p_title_id AND user_id = p_user_id;

  IF v_title.economic_event_id IS NOT NULL THEN
    SELECT * INTO v_event
    FROM public.kc_economic_events
    WHERE id = v_title.economic_event_id AND user_id = p_user_id AND cancelled_at IS NULL
    FOR UPDATE;
    IF FOUND AND v_event.event_kind = 'one_off' THEN
      UPDATE public.kc_economic_events
      SET description = p_description,
          category_id = p_category_id,
          subcategory_id = p_subcategory_id,
          amount_cents = p_amount_cents,
          occurred_on = COALESCE(p_occurred_on, occurred_on),
          updated_at = now()
      WHERE id = v_event.id AND user_id = p_user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('saved', true, 'title_id', p_title_id, 'economic_event_id', v_title.economic_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_edit_title_and_event(
  TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, TEXT, TEXT, BIGINT, DATE, DATE
) FROM PUBLIC;

-- Reconcile economic event after a scoped title cancellation (preserves settled amounts).
CREATE OR REPLACE FUNCTION public.kc_sync_cancelled_economic_events(
  p_user_id TEXT,
  p_title_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_active_sum BIGINT := 0;
BEGIN
  SELECT economic_event_id INTO v_event_id
  FROM public.kc_titles
  WHERE id = p_title_id AND user_id = p_user_id;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_active_sum
  FROM public.kc_titles
  WHERE user_id = p_user_id AND economic_event_id = v_event_id AND cancelled_at IS NULL;

  IF v_active_sum = 0 THEN
    UPDATE public.kc_economic_events
    SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
    WHERE id = v_event_id AND user_id = p_user_id AND cancelled_at IS NULL;
  ELSE
    UPDATE public.kc_economic_events
    SET amount_cents = v_active_sum, updated_at = now()
    WHERE id = v_event_id AND user_id = p_user_id AND cancelled_at IS NULL AND amount_cents <> v_active_sum;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.kc_sync_cancelled_economic_events(TEXT, UUID) FROM PUBLIC;
