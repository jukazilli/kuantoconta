-- 018: Planejamentos com múltiplos modos (compra/cotação, viagem, lista), estrutura de pagamento e cotações comparáveis

ALTER TABLE public.kc_financial_goals
  ADD COLUMN IF NOT EXISTS plan_type VARCHAR(24) NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS payment_structure VARCHAR(24) NOT NULL DEFAULT 'upfront',
  ADD COLUMN IF NOT EXISTS quotes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS budget_category_id UUID,
  ADD COLUMN IF NOT EXISTS selected_wallet_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_plan_type_check') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_plan_type_check
      CHECK (plan_type IN ('purchase', 'trip', 'shopping_list'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_payment_structure_check') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_payment_structure_check
      CHECK (payment_structure IN ('upfront', 'installments', 'hybrid'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_budget_cat_fk') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_budget_cat_fk
      FOREIGN KEY (budget_category_id, user_id) REFERENCES public.kc_categories(id, user_id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kc_financial_goals_selected_wallet_fk') THEN
    ALTER TABLE public.kc_financial_goals
      ADD CONSTRAINT kc_financial_goals_selected_wallet_fk
      FOREIGN KEY (selected_wallet_id, user_id) REFERENCES public.kc_wallets(id, user_id)
      ON DELETE SET NULL;
  END IF;
END $$;
