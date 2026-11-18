-- Atomic, idempotent settlement: one transaction with title row lock.
CREATE OR REPLACE FUNCTION public.kc_settle_title(
 p_user_id TEXT, p_title_id UUID, p_amount BIGINT, p_settled_on DATE, p_idempotency UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
 v_title public.kc_titles%ROWTYPE;
 v_previous UUID;
 v_id UUID;
BEGIN
 IF p_amount IS NULL OR p_amount <= 0 OR p_settled_on IS NULL OR p_idempotency IS NULL THEN
  RAISE EXCEPTION 'Invalid settlement data' USING ERRCODE='22023';
 END IF;
 SELECT id INTO v_previous FROM public.kc_settlements WHERE user_id=p_user_id AND idempotency_key=p_idempotency;
 IF FOUND THEN RETURN v_previous; END IF;
 SELECT * INTO v_title FROM public.kc_titles WHERE id=p_title_id AND user_id=p_user_id AND cancelled_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Title not found' USING ERRCODE='P0002'; END IF;
 IF v_title.settled_cents + p_amount > v_title.amount_cents THEN
  RAISE EXCEPTION 'Settlement exceeds outstanding balance' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.kc_settlements(user_id,title_id,wallet_id,amount_cents,settled_on,idempotency_key)
 VALUES(p_user_id,p_title_id,v_title.wallet_id,p_amount,p_settled_on,p_idempotency)
 RETURNING id INTO v_id;
 UPDATE public.kc_titles SET settled_cents=settled_cents+p_amount WHERE id=p_title_id AND user_id=p_user_id;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.kc_settle_title(TEXT,UUID,BIGINT,DATE,UUID) FROM PUBLIC;
