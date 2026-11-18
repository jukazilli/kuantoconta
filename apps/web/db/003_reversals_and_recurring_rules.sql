-- 003: Reversal ledger and compact monthly recurring rules.
-- Forward-only additive migration; never deletes financial records.
ALTER TABLE public.kc_settlements ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.kc_settlements ADD COLUMN IF NOT EXISTS reversal_reason VARCHAR(160);
CREATE INDEX IF NOT EXISTS kc_settlements_active_idx ON public.kc_settlements(user_id,title_id) WHERE reversed_at IS NULL;

CREATE OR REPLACE FUNCTION public.kc_reverse_settlement(
 p_user_id TEXT, p_settlement_id UUID, p_reason TEXT DEFAULT 'Reversão pelo titular'
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
 v_title_id UUID;
 v_title public.kc_titles%ROWTYPE;
 v_settlement public.kc_settlements%ROWTYPE;
 v_opening_at TIMESTAMPTZ;
BEGIN
 IF p_user_id IS NULL OR p_settlement_id IS NULL THEN
  RAISE EXCEPTION 'Dados inválidos' USING ERRCODE='22023';
 END IF;
 SELECT title_id INTO v_title_id FROM public.kc_settlements
 WHERE id=p_settlement_id AND user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Baixa não encontrada' USING ERRCODE='P0002'; END IF;
 -- Same lock order as kc_settle_title: title first, then settlement.
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
 IF v_title.settled_cents < v_settlement.amount_cents THEN
  RAISE EXCEPTION 'Baixa maior que o total efetivado' USING ERRCODE='22023';
 END IF;
 UPDATE public.kc_titles SET settled_cents=settled_cents-v_settlement.amount_cents
 WHERE id=v_title_id AND user_id=p_user_id;
 UPDATE public.kc_settlements
 SET reversed_at=now(),reversal_reason=left(coalesce(nullif(trim(p_reason),''),'Reversão pelo titular'),160)
 WHERE id=p_settlement_id AND user_id=p_user_id;
 RETURN p_settlement_id;
END; $$;
REVOKE ALL ON FUNCTION public.kc_reverse_settlement(TEXT,UUID,TEXT) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.kc_recurring_rules (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id TEXT NOT NULL,
 wallet_id UUID NOT NULL,
 direction VARCHAR(7) NOT NULL CHECK (direction IN ('income','expense')),
 description VARCHAR(140) NOT NULL,
 category VARCHAR(70) NOT NULL,
 subcategory VARCHAR(70),
 amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
 starts_on DATE NOT NULL,
 ends_on DATE CHECK (ends_on IS NULL OR (ends_on >= starts_on AND ends_on <= DATE '2099-12-31')),
 paused_at DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (starts_on <= DATE '2099-12-31'),
 UNIQUE(id,user_id),
 FOREIGN KEY(wallet_id,user_id) REFERENCES public.kc_wallets(id,user_id)
);
CREATE INDEX IF NOT EXISTS kc_recurring_owner_idx
 ON public.kc_recurring_rules(user_id,starts_on,ends_on);
COMMENT ON TABLE public.kc_recurring_rules IS
 'One record per monthly recurring commitment; occurrences calculated on demand through 2099, never bulk-inserted.';
