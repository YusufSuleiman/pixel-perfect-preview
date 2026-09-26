-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Settings
CREATE TABLE public.settings (
  user_id uuid PRIMARY KEY,
  account_name text NOT NULL DEFAULT 'My EGX Portfolio',
  currency text NOT NULL DEFAULT 'EGP',
  cost_basis_method text NOT NULL DEFAULT 'WAC' CHECK (cost_basis_method IN ('WAC','FIFO')),
  default_buy_commission_rate numeric NOT NULL DEFAULT 0,
  default_sell_commission_rate numeric NOT NULL DEFAULT 0,
  date_format text NOT NULL DEFAULT 'yyyy-MM-dd',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transactions (stock buys/sells)
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trade_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('BUY','SELL')),
  ticker text NOT NULL,
  company text,
  shares numeric NOT NULL CHECK (shares > 0),
  price numeric NOT NULL CHECK (price >= 0),
  commission numeric NOT NULL DEFAULT 0 CHECK (commission >= 0),
  source_override boolean NOT NULL DEFAULT false,
  capital_portion numeric,
  profit_portion numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_date_idx ON public.transactions (user_id, trade_date, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Cash movements (deposits / withdrawals)
CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  move_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('DEPOSIT','WITHDRAWAL','FEE')),
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cash_movements_user_date_idx ON public.cash_movements (user_id, move_date, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cash movements" ON public.cash_movements FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Market prices (manual now, API later)
CREATE TABLE public.market_prices (
  user_id uuid NOT NULL,
  ticker text NOT NULL,
  price numeric NOT NULL CHECK (price >= 0),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','API','LAST_TRADE')),
  as_of timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ticker)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_prices TO authenticated;
GRANT ALL ON public.market_prices TO service_role;
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prices" ON public.market_prices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
