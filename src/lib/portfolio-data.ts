import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeAccounting,
  type AccountingResult,
  type CashMovement,
  type CostBasisMethod,
  type MarketPrice,
  type Transaction,
} from "@/lib/accounting";

export interface Settings {
  user_id: string;
  account_name: string;
  currency: string;
  cost_basis_method: CostBasisMethod;
  default_buy_commission_rate: number;
  default_sell_commission_rate: number;
  date_format: string;
}

export const DEFAULT_SETTINGS: Omit<Settings, "user_id"> = {
  account_name: "My EGX Portfolio",
  currency: "EGP",
  cost_basis_method: "WAC",
  default_buy_commission_rate: 0,
  default_sell_commission_rate: 0,
  date_format: "yyyy-MM-dd",
};

export interface PortfolioData {
  transactions: Transaction[];
  cashMovements: CashMovement[];
  prices: MarketPrice[];
  settings: Settings | null;
}

async function fetchPortfolio(): Promise<PortfolioData> {
  const [tx, cm, pr, st] = await Promise.all([
    supabase.from("transactions").select("*").order("trade_date").order("created_at"),
    supabase.from("cash_movements").select("*").order("move_date").order("created_at"),
    supabase.from("market_prices").select("*"),
    supabase.from("settings").select("*").maybeSingle(),
  ]);
  const err = tx.error || cm.error || pr.error || st.error;
  if (err) throw err;

  const n = (v: unknown) => Number(v ?? 0);
  return {
    transactions: (tx.data ?? []).map((t) => ({
      id: t.id,
      trade_date: t.trade_date,
      type: t.type as Transaction["type"],
      ticker: t.ticker,
      company: t.company,
      shares: n(t.shares),
      price: n(t.price),
      commission: n(t.commission),
      source_override: !!t.source_override,
      capital_portion: t.capital_portion == null ? null : n(t.capital_portion),
      profit_portion: t.profit_portion == null ? null : n(t.profit_portion),
      notes: t.notes,
      created_at: t.created_at,
    })),
    cashMovements: (cm.data ?? []).map((c) => ({
      id: c.id,
      move_date: c.move_date,
      kind: c.kind as CashMovement["kind"],
      amount: n(c.amount),
      description: c.description,
      created_at: c.created_at,
    })),
    prices: (pr.data ?? []).map((p) => ({
      ticker: p.ticker,
      price: n(p.price),
      source: p.source as MarketPrice["source"],
      as_of: p.as_of,
    })),
    settings: st.data
      ? {
          user_id: st.data.user_id,
          account_name: st.data.account_name,
          currency: st.data.currency,
          cost_basis_method: st.data.cost_basis_method as CostBasisMethod,
          default_buy_commission_rate: n(st.data.default_buy_commission_rate),
          default_sell_commission_rate: n(st.data.default_sell_commission_rate),
          date_format: st.data.date_format,
        }
      : null,
  };
}

export const portfolioQueryKey = ["portfolio"] as const;

export function usePortfolio() {
  const query = useQuery({ queryKey: portfolioQueryKey, queryFn: fetchPortfolio });
  const data = query.data;

  const accounting: AccountingResult = useMemo(
    () =>
      computeAccounting(
        data?.transactions ?? [],
        data?.cashMovements ?? [],
        data?.prices ?? [],
        data?.settings?.cost_basis_method ?? "WAC",
      ),
    [data],
  );

  const settings: Settings | null = data?.settings ?? null;
  const currency = settings?.currency ?? "EGP";

  return { ...query, data, accounting, settings, currency };
}

export function useRefreshPortfolio() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: portfolioQueryKey });
}
