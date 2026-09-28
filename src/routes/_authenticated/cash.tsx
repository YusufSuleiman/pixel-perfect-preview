import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Stat } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { CashDialog } from "@/components/CashDialog";
import { supabase } from "@/integrations/supabase/client";
import { usePortfolio, useRefreshPortfolio } from "@/lib/portfolio-data";
import type { CashMovement } from "@/lib/accounting";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cash")({
  head: () => ({
    meta: [
      { title: "Cash — EGX Ledger" },
      { name: "description", content: "Deposits, withdrawals, fees and a full cash reconciliation." },
      { property: "og:title", content: "Cash — EGX Ledger" },
      { property: "og:description", content: "Cash movements and reconciliation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashPage,
});

function CashPage() {
  const { accounting, currency } = usePortfolio();
  const refresh = useRefreshPortfolio();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CashMovement | null>(null);
  const t = accounting.totals;
  const r = accounting.reconciliation;
  const entries = accounting.ledger.filter((e) => e.kind === "CASH").reverse();

  async function remove(id: string) {
    if (!confirm("Delete this cash movement? All figures will be recalculated.")) return;
    const { error } = await supabase.from("cash_movements").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    refresh();
  }

  const rows: [string, number][] = [
    ["Deposits", r.deposits],
    ["Sale proceeds", r.saleProceeds],
    ["Purchases", -r.purchases],
    ["Buy commissions", -r.buyCommission],
    ["Sell commissions", -r.sellCommission],
    ["Other fees", -r.otherFees],
    ["Withdrawals", -r.withdrawals],
  ];

  return (
    <div>
      <PageHeader
        title="Cash"
        description="Money in and out of the account, plus a check that the cash balance adds up."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}>Add movement</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cash balance" value={money(t.cash, currency)} accent="cash" />
        <Stat label="Capital cash" value={money(t.capitalCash, currency)} accent="capital" />
        <Stat label="Profit cash" value={money(t.profitCash, currency)} accent="profit" />
        <Stat label="Total deposits" value={money(t.totalDeposits, currency)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="panel overflow-x-auto lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-border border-b text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Cash after</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {entries.length === 0 && (
                <tr><td colSpan={6} className="text-muted-foreground px-4 py-6">No cash movements yet.</td></tr>
              )}
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="tnum px-4 py-3">{e.date}</td>
                  <td className="px-4 py-3">{e.cashMovement?.kind}</td>
                  <td className="text-muted-foreground px-4 py-3">{e.cashMovement?.description ?? "—"}</td>
                  <td className={`tnum px-4 py-3 text-right ${e.cashDelta >= 0 ? "text-gain" : "text-loss"}`}>
                    {money(e.cashDelta, currency)}
                  </td>
                  <td className="tnum px-4 py-3 text-right">{money(e.after.cash, currency)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(e.cashMovement ?? null); setOpen(true); }}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(e.id)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel p-4">
          <h2 className="font-semibold">Cash reconciliation</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tnum">{money(v, currency)}</dd>
              </div>
            ))}
            <div className="border-border flex justify-between border-t pt-2 font-semibold">
              <dt>Computed cash</dt>
              <dd className="tnum">{money(r.computedCash, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Running ledger cash</dt>
              <dd className="tnum">{money(r.runningCash, currency)}</dd>
            </div>
          </dl>
          <p className={`mt-3 text-sm font-medium ${r.balanced ? "text-gain" : "text-loss"}`}>
            {r.balanced ? "Balanced ✓" : "Not balanced — review your records"}
          </p>
        </div>
      </div>

      <CashDialog open={open} onOpenChange={setOpen} onSaved={refresh} editing={editing} />
    </div>
  );
}
