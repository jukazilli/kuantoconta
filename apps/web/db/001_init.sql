-- kuantoconta migration 001 — new isolated database; append-only base.
-- Idempotent; run with restricted DB credentials in controlled release.
CREATE TABLE IF NOT EXISTS public.kc_legal_acceptances (user_id TEXT NOT NULL, terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL, accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id,terms_version,privacy_version));

CREATE TABLE IF NOT EXISTS public.kc_wallets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, name VARCHAR(90) NOT NULL, opening_balance_cents BIGINT, opening_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(id,user_id), CHECK ((opening_balance_cents IS NULL AND opening_at IS NULL) OR (opening_balance_cents IS NOT NULL AND opening_at IS NOT NULL)));

CREATE TABLE IF NOT EXISTS public.kc_titles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, wallet_id UUID NOT NULL, direction VARCHAR(7) NOT NULL CHECK(direction IN ('income','expense')), description VARCHAR(140) NOT NULL, category VARCHAR(70) NOT NULL DEFAULT 'Outros', subcategory VARCHAR(70), amount_cents BIGINT NOT NULL CHECK(amount_cents>0), settled_cents BIGINT NOT NULL DEFAULT 0 CHECK(settled_cents>=0 AND settled_cents<=amount_cents), due_on DATE NOT NULL, series_id UUID, installment_index INTEGER NOT NULL DEFAULT 1 CHECK(installment_index>=1), installment_total INTEGER NOT NULL DEFAULT 1 CHECK(installment_total>=1), recurrence VARCHAR(20) NOT NULL DEFAULT 'single' CHECK(recurrence IN ('single','installments','monthly')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), cancelled_at TIMESTAMPTZ, UNIQUE(id,user_id), UNIQUE(series_id,installment_index), FOREIGN KEY (wallet_id,user_id) REFERENCES public.kc_wallets(id,user_id));

CREATE INDEX IF NOT EXISTS kc_titles_user_due_idx ON public.kc_titles(user_id,due_on) WHERE cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS public.kc_settlements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, title_id UUID NOT NULL, wallet_id UUID NOT NULL, amount_cents BIGINT NOT NULL CHECK(amount_cents>0), settled_on DATE NOT NULL, idempotency_key UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key), FOREIGN KEY (title_id,user_id) REFERENCES public.kc_titles(id,user_id), FOREIGN KEY (wallet_id,user_id) REFERENCES public.kc_wallets(id,user_id));

CREATE INDEX IF NOT EXISTS kc_settlements_owner_date_idx ON public.kc_settlements(user_id,settled_on);

CREATE TABLE IF NOT EXISTS public.kc_assets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, label VARCHAR(120) NOT NULL, value_cents BIGINT NOT NULL CHECK(value_cents>=0), valued_on DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.kc_liabilities (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, label VARCHAR(120) NOT NULL, principal_cents BIGINT NOT NULL CHECK(principal_cents>=0), valued_on DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.kc_categories (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, name VARCHAR(80) NOT NULL, direction VARCHAR(7) NOT NULL CHECK(direction IN ('income','expense')), parent_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,name,direction));

COMMENT ON TABLE public.kc_titles IS 'Títulos a pagar/receber. Valor realizado controlado por kc_settlements; resultados monetários em centavos.';
