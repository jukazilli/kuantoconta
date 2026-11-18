-- 004: Scoped cancellation for installments and monthly rules.
-- Additive and auditable. NO DELETE of titles, settlements, or user data.
CREATE TABLE IF NOT EXISTS public.kc_title_cancellation_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id TEXT NOT NULL,
 title_id UUID NOT NULL,
 scope VARCHAR(8) NOT NULL CHECK (scope IN ('only','future','all')),
 original_amount_cents BIGINT NOT NULL CHECK (original_amount_cents > 0),
 paid_cents BIGINT NOT NULL CHECK (paid_cents >= 0),
 cancelled_pending_cents BIGINT NOT NULL CHECK (cancelled_pending_cents > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(title_id,user_id) REFERENCES public.kc_titles(id,user_id)
);
CREATE INDEX IF NOT EXISTS kc_title_cancellation_events_idx
 ON public.kc_title_cancellation_events(user_id,title_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.kc_recurring_cancellation_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id TEXT NOT NULL,
 rule_id UUID NOT NULL,
 scope VARCHAR(8) NOT NULL CHECK (scope IN ('only','future','all')),
 occurrence_index INTEGER NOT NULL CHECK (occurrence_index>=1),
 effective_on DATE NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(rule_id,user_id) REFERENCES public.kc_recurring_rules(id,user_id)
);
CREATE INDEX IF NOT EXISTS kc_recurring_cancel_audit_idx
 ON public.kc_recurring_cancellation_events(user_id,rule_id,created_at DESC);

-- Physical installment series AND legacy materialized monthly series.
CREATE OR REPLACE FUNCTION public.kc_cancel_title_scope(
 p_user_id TEXT,p_title_id UUID,p_scope TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
 v_anchor public.kc_titles%ROWTYPE;
 v_count INTEGER:=0;
 v_amount BIGINT:=0;
 v_protected INTEGER:=0;
BEGIN
 IF p_scope NOT IN ('only','future','all') OR p_scope IS NULL THEN
  RAISE EXCEPTION 'Escopo de exclusão inválido' USING ERRCODE='22023';
 END IF;
 -- Obtain series identity first, then acquire series lock before any row lock.
 -- This prevents two concurrent scope deletions on different installments deadlocking.
 SELECT * INTO v_anchor FROM public.kc_titles
 WHERE user_id=p_user_id AND id=p_title_id AND cancelled_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Título não encontrado' USING ERRCODE='P0002'; END IF;
 IF v_anchor.series_id IS NULL AND p_scope<>'only' THEN
  RAISE EXCEPTION 'Este título não possui série' USING ERRCODE='22023';
 END IF;
 IF v_anchor.series_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id||':'||v_anchor.series_id::text,0));
 END IF;
 SELECT * INTO v_anchor FROM public.kc_titles
 WHERE user_id=p_user_id AND id=p_title_id AND cancelled_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Título já cancelado' USING ERRCODE='P0002'; END IF;
 -- Lock all affected rows to coordinate atomically with settlements and edits.
 PERFORM id FROM public.kc_titles WHERE user_id=p_user_id AND cancelled_at IS NULL
 AND (CASE WHEN p_scope='only' OR v_anchor.series_id IS NULL THEN id=p_title_id
           ELSE series_id=v_anchor.series_id AND
             (p_scope='all' OR installment_index>=v_anchor.installment_index) END)
 ORDER BY id FOR UPDATE;
 SELECT coalesce(sum(amount_cents-settled_cents),0),count(*) FILTER (WHERE settled_cents=amount_cents)
 INTO v_amount,v_protected FROM public.kc_titles WHERE user_id=p_user_id AND cancelled_at IS NULL
 AND (CASE WHEN p_scope='only' OR v_anchor.series_id IS NULL THEN id=p_title_id
           ELSE series_id=v_anchor.series_id AND
             (p_scope='all' OR installment_index>=v_anchor.installment_index) END);
 IF p_scope='only' AND v_amount=0 THEN
  RAISE EXCEPTION 'Título totalmente baixado: reverta a baixa antes de excluir somente este' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.kc_title_cancellation_events
 (user_id,title_id,scope,original_amount_cents,paid_cents,cancelled_pending_cents)
 SELECT user_id,id,p_scope,amount_cents,settled_cents,amount_cents-settled_cents
 FROM public.kc_titles WHERE user_id=p_user_id AND cancelled_at IS NULL
 AND amount_cents>settled_cents
 AND (CASE WHEN p_scope='only' OR v_anchor.series_id IS NULL THEN id=p_title_id
           ELSE series_id=v_anchor.series_id AND
             (p_scope='all' OR installment_index>=v_anchor.installment_index) END);
 UPDATE public.kc_titles
 SET cancelled_at=CASE WHEN settled_cents=0 THEN now() ELSE cancelled_at END,
     amount_cents=CASE WHEN settled_cents>0 THEN settled_cents ELSE amount_cents END
 WHERE user_id=p_user_id AND cancelled_at IS NULL AND amount_cents>settled_cents
 AND (CASE WHEN p_scope='only' OR v_anchor.series_id IS NULL THEN id=p_title_id
           ELSE series_id=v_anchor.series_id AND
             (p_scope='all' OR installment_index>=v_anchor.installment_index) END);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN jsonb_build_object('affected',v_count,'cancelled_pending_cents',v_amount,'preserved_paid',v_protected,'scope',p_scope);
END;$$;
REVOKE ALL ON FUNCTION public.kc_cancel_title_scope(TEXT,UUID,TEXT) FROM PUBLIC;

-- Monthly rule: single occurrence creates a cancellation tombstone; future/all pause
-- the rule and cancel all materialized unsettled portions in scope.
CREATE OR REPLACE FUNCTION public.kc_cancel_recurring_scope(
 p_user_id TEXT,p_rule_id UUID,p_occurrence_index INTEGER,p_scope TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
 v_rule public.kc_recurring_rules%ROWTYPE;
 v_month DATE;
 v_due DATE;
 v_cut DATE;
 v_count INTEGER:=0;
 v_protected INTEGER:=0;
 v_amount BIGINT:=0;
BEGIN
 IF p_scope NOT IN ('only','future','all') OR p_scope IS NULL
    OR p_occurrence_index IS NULL OR p_occurrence_index<1 THEN
  RAISE EXCEPTION 'Escopo ou ocorrência inválida' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_rule FROM public.kc_recurring_rules
 WHERE id=p_rule_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Regra não encontrada' USING ERRCODE='P0002'; END IF;
 v_month:=(date_trunc('month',v_rule.starts_on)::date+
            ((p_occurrence_index-1)||' months')::interval)::date;
 v_due:=least((v_month+(extract(day from v_rule.starts_on)::int-1)*interval '1 day')::date,
              (v_month+interval '1 month'-interval '1 day')::date);
 IF v_due<v_rule.starts_on OR v_due>date '2099-12-31' OR
    (v_rule.ends_on IS NOT NULL AND v_due>v_rule.ends_on) THEN
   RAISE EXCEPTION 'Ocorrência fora da vigência' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id||':'||p_rule_id::text,0));
 INSERT INTO public.kc_recurring_cancellation_events
 (user_id,rule_id,scope,occurrence_index,effective_on)
 VALUES(p_user_id,p_rule_id,p_scope,p_occurrence_index,
        CASE WHEN p_scope='all' THEN v_rule.starts_on ELSE v_due END);
 IF p_scope='only' THEN
  INSERT INTO public.kc_titles
   (user_id,wallet_id,direction,description,category,subcategory,
    amount_cents,due_on,recurrence,series_id,installment_index,installment_total)
  VALUES(p_user_id,v_rule.wallet_id,v_rule.direction,v_rule.description,
         v_rule.category,v_rule.subcategory,v_rule.amount_cents,v_due,
         'monthly',p_rule_id,p_occurrence_index,1)
  ON CONFLICT (series_id,installment_index) DO NOTHING;
 ELSE
  v_cut:=CASE WHEN p_scope='all' THEN v_rule.starts_on ELSE v_due END;
  UPDATE public.kc_recurring_rules
  SET paused_at=least(coalesce(paused_at,v_cut),v_cut)
  WHERE user_id=p_user_id AND id=p_rule_id;
 END IF;
 PERFORM id FROM public.kc_titles
 WHERE user_id=p_user_id AND series_id=p_rule_id AND cancelled_at IS NULL
   AND (p_scope='all' OR p_scope='future' AND installment_index>=p_occurrence_index
        OR p_scope='only' AND installment_index=p_occurrence_index)
 ORDER BY id FOR UPDATE;
 SELECT coalesce(sum(amount_cents-settled_cents),0),
        count(*) FILTER (WHERE settled_cents=amount_cents)
 INTO v_amount,v_protected
 FROM public.kc_titles WHERE user_id=p_user_id AND series_id=p_rule_id
 AND cancelled_at IS NULL AND (p_scope='all' OR p_scope='future' AND
 installment_index>=p_occurrence_index OR p_scope='only' AND installment_index=p_occurrence_index);
 IF p_scope='only' AND v_amount=0 THEN
   RAISE EXCEPTION 'Esta ocorrência já foi totalmente baixada' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.kc_title_cancellation_events
 (user_id,title_id,scope,original_amount_cents,paid_cents,cancelled_pending_cents)
 SELECT user_id,id,p_scope,amount_cents,settled_cents,amount_cents-settled_cents
 FROM public.kc_titles
 WHERE user_id=p_user_id AND series_id=p_rule_id AND cancelled_at IS NULL
 AND amount_cents>settled_cents AND
 (p_scope='all' OR p_scope='future' AND installment_index>=p_occurrence_index
  OR p_scope='only' AND installment_index=p_occurrence_index);
 UPDATE public.kc_titles SET
 cancelled_at=CASE WHEN settled_cents=0 THEN now() ELSE cancelled_at END,
 amount_cents=CASE WHEN settled_cents>0 THEN settled_cents ELSE amount_cents END
 WHERE user_id=p_user_id AND series_id=p_rule_id AND cancelled_at IS NULL
 AND amount_cents>settled_cents AND
 (p_scope='all' OR p_scope='future' AND installment_index>=p_occurrence_index
  OR p_scope='only' AND installment_index=p_occurrence_index);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN jsonb_build_object('affected',v_count,'cancelled_pending_cents',v_amount,
    'preserved_paid',v_protected,'scope',p_scope,
    'recurrence_paused',p_scope<>'only');
END;$$;
REVOKE ALL ON FUNCTION public.kc_cancel_recurring_scope(TEXT,UUID,INTEGER,TEXT) FROM PUBLIC;

-- Preserve cancellation when reversing a previously paid amount.
-- If all remaining paid value is reversed, the already-cancelled title
-- becomes a tombstone; it must not silently reopen a cancelled obligation.
CREATE OR REPLACE FUNCTION public.kc_reverse_settlement(
 p_user_id TEXT, p_settlement_id UUID, p_reason TEXT DEFAULT 'Reversão pelo titular'
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
 v_title_id UUID;
 v_title public.kc_titles%ROWTYPE;
 v_settlement public.kc_settlements%ROWTYPE;
 v_opening_at TIMESTAMPTZ;
 v_cancelled BOOLEAN;
BEGIN
 IF p_user_id IS NULL OR p_settlement_id IS NULL THEN
  RAISE EXCEPTION 'Dados inválidos' USING ERRCODE='22023';
 END IF;
 SELECT title_id INTO v_title_id FROM public.kc_settlements
 WHERE id=p_settlement_id AND user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Baixa não encontrada' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_title FROM public.kc_titles
 WHERE id=v_title_id AND user_id=p_user_id AND cancelled_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Título indisponível' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_settlement FROM public.kc_settlements
 WHERE id=p_settlement_id AND user_id=p_user_id AND title_id=v_title_id FOR UPDATE;
 IF NOT FOUND OR v_settlement.reversed_at IS NOT NULL THEN
  RAISE EXCEPTION 'Baixa já revertida ou inexistente' USING ERRCODE='22023';
 END IF;
 SELECT opening_at INTO v_opening_at FROM public.kc_wallets
 WHERE id=v_settlement.wallet_id AND user_id=p_user_id;
 IF v_opening_at IS NOT NULL AND v_settlement.created_at <= v_opening_at THEN
  RAISE EXCEPTION 'Reversão anterior ao saldo de abertura requer conciliação' USING ERRCODE='22023';
 END IF;
 IF v_title.settled_cents<v_settlement.amount_cents THEN
  RAISE EXCEPTION 'Baixa maior que o total efetivado' USING ERRCODE='22023';
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.kc_title_cancellation_events
    WHERE user_id=p_user_id AND title_id=v_title_id) INTO v_cancelled;
 IF v_cancelled AND v_title.settled_cents=v_title.amount_cents THEN
   IF v_title.settled_cents=v_settlement.amount_cents THEN
     UPDATE public.kc_titles SET settled_cents=0,cancelled_at=now()
       WHERE id=v_title_id AND user_id=p_user_id;
   ELSE
     UPDATE public.kc_titles
      SET settled_cents=settled_cents-v_settlement.amount_cents,
          amount_cents=amount_cents-v_settlement.amount_cents
      WHERE id=v_title_id AND user_id=p_user_id;
   END IF;
 ELSE
   UPDATE public.kc_titles SET settled_cents=settled_cents-v_settlement.amount_cents
   WHERE id=v_title_id AND user_id=p_user_id;
 END IF;
 UPDATE public.kc_settlements SET reversed_at=now(),
  reversal_reason=left(coalesce(nullif(trim(p_reason),''),'Reversão pelo titular'),160)
 WHERE id=p_settlement_id AND user_id=p_user_id;
 RETURN p_settlement_id;
END; $$;
REVOKE ALL ON FUNCTION public.kc_reverse_settlement(TEXT,UUID,TEXT) FROM PUBLIC;

-- Materialization shares the same row lock as cancellation. A request started
-- before cancellation cannot revive a cancelled future occurrence afterward.
CREATE OR REPLACE FUNCTION public.kc_materialize_recurring_occurrence(
 p_user_id TEXT,p_rule_id UUID,p_occurrence_index INTEGER
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
 v_rule public.kc_recurring_rules%ROWTYPE;
 v_month DATE;
 v_due DATE;
 v_title_id UUID;
 v_cancelled_at TIMESTAMPTZ;
BEGIN
 IF p_occurrence_index IS NULL OR p_occurrence_index<1 THEN
  RAISE EXCEPTION 'Ocorrência inválida' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_rule FROM public.kc_recurring_rules
 WHERE id=p_rule_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Regra não encontrada' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id||':'||p_rule_id::text,0));
 v_month:=(date_trunc('month',v_rule.starts_on)::date+
            ((p_occurrence_index-1)||' months')::interval)::date;
 v_due:=least((v_month+(extract(day from v_rule.starts_on)::int-1)*interval '1 day')::date,
              (v_month+interval '1 month'-interval '1 day')::date);
 IF v_due<v_rule.starts_on OR v_due>date '2099-12-31'
 OR v_rule.ends_on IS NOT NULL AND v_due>v_rule.ends_on
 OR v_rule.paused_at IS NOT NULL AND v_due>=v_rule.paused_at THEN
  RAISE EXCEPTION 'Esta ocorrência foi encerrada ou está fora da vigência' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.kc_titles
   (user_id,wallet_id,direction,description,category,subcategory,
    amount_cents,due_on,recurrence,series_id,installment_index,installment_total)
 VALUES (p_user_id,v_rule.wallet_id,v_rule.direction,v_rule.description,
         v_rule.category,v_rule.subcategory,v_rule.amount_cents,v_due,'monthly',
         p_rule_id,p_occurrence_index,1)
 ON CONFLICT (series_id,installment_index) DO NOTHING;
 SELECT id,cancelled_at INTO v_title_id,v_cancelled_at FROM public.kc_titles
 WHERE user_id=p_user_id AND series_id=p_rule_id AND installment_index=p_occurrence_index;
 IF NOT FOUND OR v_cancelled_at IS NOT NULL THEN
  RAISE EXCEPTION 'Ocorrência já cancelada ou indisponível' USING ERRCODE='22023';
 END IF;
 RETURN v_title_id;
END;$$;
REVOKE ALL ON FUNCTION public.kc_materialize_recurring_occurrence(TEXT,UUID,INTEGER) FROM PUBLIC;
