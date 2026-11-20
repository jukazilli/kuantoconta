-- Migration 016: Caixinhas com saldo isolado, vínculo bancário e integração com planejamento de compras

-- 1. Carteiras: suporte a sub-carteiras de Caixinha vinculadas a uma conta bancária principal
ALTER TABLE public.kc_wallets
  ADD COLUMN IF NOT EXISTS parent_wallet_id UUID,
  ADD COLUMN IF NOT EXISTS caixinha_purpose VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_wallets_caixinha_purpose_check') THEN
    ALTER TABLE public.kc_wallets
      ADD CONSTRAINT kc_wallets_caixinha_purpose_check
      CHECK (caixinha_purpose IS NULL OR caixinha_purpose IN ('reserve', 'goal', 'capital'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_wallets_parent_wallet_fk') THEN
    ALTER TABLE public.kc_wallets
      ADD CONSTRAINT kc_wallets_parent_wallet_fk
      FOREIGN KEY (parent_wallet_id, user_id) REFERENCES public.kc_wallets(id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS kc_wallets_user_parent_idx
  ON public.kc_wallets(user_id, parent_wallet_id)
  WHERE parent_wallet_id IS NOT NULL;

-- 2. Objetivos e planejamentos: vínculo com carteira da Caixinha, banco pai, finalidade e caixinha de entrada
ALTER TABLE public.kc_financial_goals
  ADD COLUMN IF NOT EXISTS wallet_id UUID,
  ADD COLUMN IF NOT EXISTS parent_wallet_id UUID,
  ADD COLUMN IF NOT EXISTS caixinha_purpose VARCHAR(20) NOT NULL DEFAULT 'goal',
  ADD COLUMN IF NOT EXISTS source_goal_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_purpose_check') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_purpose_check
      CHECK (caixinha_purpose IN ('reserve', 'goal', 'capital'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_wallet_fk') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_wallet_fk
      FOREIGN KEY (wallet_id, user_id) REFERENCES public.kc_wallets(id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_parent_wallet_fk') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_parent_wallet_fk
      FOREIGN KEY (parent_wallet_id, user_id) REFERENCES public.kc_wallets(id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_source_goal_fk') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_source_goal_fk
      FOREIGN KEY (source_goal_id, user_id) REFERENCES public.kc_financial_goals(id, user_id);
  END IF;
END $$;

-- 3. Atualiza kc_archive_wallet para também migrar parent_wallet_id das Caixinhas vinculadas
CREATE OR REPLACE FUNCTION public.kc_archive_wallet(
  p_user_id TEXT,
  p_source_wallet_id UUID,
  p_target_wallet_id UUID,
  p_balance_action TEXT DEFAULT 'transfer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source public.kc_wallets%ROWTYPE;
  v_target public.kc_wallets%ROWTYPE;
  v_moved_titles INTEGER := 0;
  v_moved_rules INTEGER := 0;
  v_moved_settlements INTEGER := 0;
BEGIN
  IF p_user_id IS NULL OR p_source_wallet_id IS NULL OR p_target_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Conta de origem e destino são obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF p_source_wallet_id = p_target_wallet_id THEN
    RAISE EXCEPTION 'Escolha uma conta destino diferente da conta a arquivar.' USING ERRCODE = '22023';
  END IF;
  IF p_balance_action NOT IN ('transfer', 'discard') THEN
    RAISE EXCEPTION 'Ação de saldo inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.kc_wallets
  WHERE id = p_source_wallet_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta de origem não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_source.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta conta já está arquivada.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target
  FROM public.kc_wallets
  WHERE id = p_target_wallet_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta destino não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'A conta destino não pode estar arquivada.' USING ERRCODE = '22023';
  END IF;

  IF p_balance_action = 'transfer' AND v_source.opening_balance_cents IS NOT NULL THEN
    UPDATE public.kc_wallets
    SET opening_balance_cents = COALESCE(opening_balance_cents, 0) + v_source.opening_balance_cents,
        opening_at = COALESCE(opening_at, now())
    WHERE id = p_target_wallet_id AND user_id = p_user_id;
  END IF;

  UPDATE public.kc_titles
  SET wallet_id = p_target_wallet_id
  WHERE user_id = p_user_id AND wallet_id = p_source_wallet_id;
  GET DIAGNOSTICS v_moved_titles = ROW_COUNT;

  UPDATE public.kc_settlements
  SET wallet_id = p_target_wallet_id
  WHERE user_id = p_user_id AND wallet_id = p_source_wallet_id;
  GET DIAGNOSTICS v_moved_settlements = ROW_COUNT;

  UPDATE public.kc_recurring_rules
  SET wallet_id = p_target_wallet_id
  WHERE user_id = p_user_id AND wallet_id = p_source_wallet_id;
  GET DIAGNOSTICS v_moved_rules = ROW_COUNT;

  UPDATE public.kc_debt_payments
  SET wallet_id = p_target_wallet_id
  WHERE user_id = p_user_id AND wallet_id = p_source_wallet_id;

  UPDATE public.kc_assets
  SET linked_wallet_id = p_target_wallet_id
  WHERE user_id = p_user_id AND linked_wallet_id = p_source_wallet_id;

  UPDATE public.kc_wallets
  SET parent_wallet_id = p_target_wallet_id
  WHERE user_id = p_user_id AND parent_wallet_id = p_source_wallet_id;

  UPDATE public.kc_financial_goals
  SET parent_wallet_id = p_target_wallet_id
  WHERE user_id = p_user_id AND parent_wallet_id = p_source_wallet_id;

  UPDATE public.kc_wallets
  SET archived_at = now(),
      opening_balance_cents = 0,
      opening_at = now()
  WHERE id = p_source_wallet_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'archived_wallet_id', p_source_wallet_id,
    'target_wallet_id', p_target_wallet_id,
    'balance_action', p_balance_action,
    'moved_titles', v_moved_titles,
    'moved_settlements', v_moved_settlements,
    'moved_recurring_rules', v_moved_rules
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_archive_wallet(TEXT, UUID, UUID, TEXT) FROM PUBLIC;
