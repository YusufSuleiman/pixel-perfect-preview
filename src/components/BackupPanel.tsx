import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio, useRefreshPortfolio } from "@/lib/portfolio-data";
import { computeAccounting } from "@/lib/accounting";
import { z } from "zod";

const txSchema = z.object({
  id: z.string().uuid(),
  trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  type: z.enum(["BUY", "SELL"]),
  ticker: z.string().min(1).max(20),
  company: z.string().max(200).nullable(),
  shares: z.number().positive(),
  price: z.number().nonnegative(),
  commission: z.number().nonnegative(),
  source_override: z.boolean(),
  capital_portion: z.number().nullable(),
  profit_portion: z.number().nullable(),
  notes: z.string().max(2000).nullable(),
  created_at: z.string(),
});
const cmSchema = z.object({
  id: z.string().uuid(),
  move_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  kind: z.enum(["DEPOSIT", "WITHDRAWAL", "FEE"]),
  amount: z.number().positive(),
  description: z.string().max(500).nullable(),
  created_at: z.string(),
});
const priceSchema = z.object({
  ticker: z.string().min(1).max(20),
  price: z.number().nonnegative(),
  source: z.enum(["MANUAL", "API", "LAST_TRADE"]),
  as_of: z.string(),
});
const backupSchema = z.object({
  app: z.literal("egx-ledger"),
  version: z.number(),
  transactions: z.array(txSchema),
  cashMovements: z.array(cmSchema),
  prices: z.array(priceSchema),
  settings: z
    .object({
      account_name: z.string(),
      currency: z.string(),
      cost_basis_method: z.enum(["WAC", "FIFO"]),
      default_buy_commission_rate: z.number(),
      default_sell_commission_rate: z.number(),
      date_format: z.string(),
    })
    .nullable(),
});

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupPanel() {
  const { user } = useAuth();
  const { data, accounting, refetch } = usePortfolio();
  const refresh = useRefreshPortfolio();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function exportJson() {
    if (!data) return;
    const { user_id: _u, ...settings } = data.settings ?? ({} as never);
    const backup = {
      app: "egx-ledger",
      version: 1,
      exported_at: new Date().toISOString(),
      transactions: data.transactions,
      cashMovements: data.cashMovements,
      prices: data.prices,
      settings: data.settings ? settings : null,
      // provenance is derived; included for reference only, rebuilt on restore
      derived: { totals: accounting.totals, ledger: accounting.ledger.map((e) => ({ id: e.id, capitalPortion: e.capitalPortion, profitPortion: e.profitPortion })) },
    };
    download(`egx-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), "application/json");
    toast.success("Backup downloaded");
  }

  async function restore(file: File) {
    if (!user) return;
    let parsed;
    try {
      parsed = backupSchema.parse(JSON.parse(await file.text()));
    } catch (e) {
      toast.error("Invalid backup file: " + (e instanceof Error ? e.message.slice(0, 200) : ""));
      return;
    }
    const txIds = new Set(parsed.transactions.map((t) => t.id));
    if (txIds.size !== parsed.transactions.length) {
      toast.error("Backup contains duplicate transaction IDs — restore cancelled.");
      return;
    }
    const existing = new Set([...(data?.transactions ?? []).map((t) => t.id), ...(data?.cashMovements ?? []).map((c) => c.id)]);
    const dupes = [...parsed.transactions, ...parsed.cashMovements].filter((r) => existing.has(r.id)).length;
    const check = computeAccounting(parsed.transactions, parsed.cashMovements, parsed.prices, parsed.settings?.cost_basis_method ?? "WAC");
    const msg =
      `Restore ${parsed.transactions.length} trades and ${parsed.cashMovements.length} cash records?\n\n` +
      `This REPLACES all your current records.` +
      (dupes ? `\n${dupes} records share IDs with existing data (they will be overwritten).` : "") +
      (check.warnings.length ? `\n\nThe backup has ${check.warnings.length} accounting warning(s).` : "");
    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      const uid = user.id;
      for (const t of ["transactions", "cash_movements", "market_prices"] as const) {
        const { error } = await supabase.from(t).delete().eq("user_id", uid);
        if (error) throw error;
      }
      if (parsed.transactions.length) {
        const { error } = await supabase.from("transactions").insert(parsed.transactions.map((t) => ({ ...t, user_id: uid })));
        if (error) throw error;
      }
      if (parsed.cashMovements.length) {
        const { error } = await supabase.from("cash_movements").insert(parsed.cashMovements.map((c) => ({ ...c, user_id: uid })));
        if (error) throw error;
      }
      if (parsed.prices.length) {
        const { error } = await supabase.from("market_prices").insert(parsed.prices.map((p) => ({ ...p, user_id: uid })));
        if (error) throw error;
      }
      if (parsed.settings) {
        const { error } = await supabase.from("settings").upsert({ ...parsed.settings, user_id: uid }, { onConflict: "user_id" });
        if (error) throw error;
      }
      toast.success("Backup restored");
    } catch (e) {
      toast.error("Restore failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function recalc() {
    const r = await refetch();
    const d = r.data;
    if (!d) return;
    const res = computeAccounting(d.transactions, d.cashMovements, d.prices, d.settings?.cost_basis_method ?? "WAC");
    if (res.reconciliation.balanced && res.warnings.length === 0) toast.success("Rebuilt from ledger — everything balances ✓");
    else toast.warning(`Rebuilt. ${res.warnings.length} warning(s)${res.reconciliation.balanced ? "" : ", cash does not reconcile"}. See dashboard.`);
  }

  return (
    <div className="panel mt-6 space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Backup, restore & accounting</h2>
        <p className="text-muted-foreground text-sm">A JSON backup contains every trade, cash record, price and setting. Restoring rebuilds all figures from it.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportJson}><Download className="mr-2 h-4 w-4" />Download backup</Button>
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />{busy ? "Restoring…" : "Restore backup"}</Button>
        <Button variant="outline" onClick={recalc}><RefreshCw className="mr-2 h-4 w-4" />Recalculate everything</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void restore(f); }} />
      </div>
    </div>
  );
}
