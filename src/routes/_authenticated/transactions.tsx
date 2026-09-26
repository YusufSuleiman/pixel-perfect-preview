import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TransactionDialog } from "@/components/TransactionDialog";
import { usePortfolio, useRefreshPortfolio } from "@/lib/portfolio-data";
import { supabase } from "@/integrations/supabase/client";
import { money, num } from "@/lib/format";
import type { LedgerEntry, Transaction } from "@/lib/accounting";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — EGX Ledger" },
      { name: "description", content: "Complete, auditable transaction history with funding provenance." },
      { property: "og:title", content: "Transactions — EGX Ledger" },
      { property: "og:description", content: "Every buy and sell with its full accounting impact." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Transactions,
});

type SortKey = "date" | "ticker" | "amount" | "pl";

function Transactions() {
  const { accounting, currency } = usePortfolio();
  const refresh = useRefreshPortfolio();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [audit, setAudit] = useState<LedgerEntry | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("date");

  const rows = useMemo(() => {
    const entries = accounting.ledger.filter((e) => e.kind === "TRANSACTION");
    const filtered = entries.filter((e) => {
      const tx = e.transaction!;
      const matchQ =
        !q.trim() ||
        tx.ticker.toLowerCase().includes(q.trim().toLowerCase()) ||
        (tx.company ?? "").toLowerCase().includes(q.trim().toLowerCase());
      const matchType = typeFilter === "ALL" || tx.type === typeFilter;
      return matchQ && matchType;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "ticker") return a.transaction!.ticker.localeCompare(b.transaction!.ticker);
      if (sort === "amount") return Math.abs(b.gross) - Math.abs(a.gross);
      if (sort === "pl") return b.realizedNet - a.realizedNet;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1;
    });
    return sorted;
  }, [accounting.ledger, q, typeFilter, sort]);

  async function remove() {
    if (!deleting) return;
    const { error } = await supabase.from("transactions").delete().eq("id", deleting.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Transaction deleted — all totals recalculated");
      refresh();
    }
    setDeleting(null);
  }

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="The source of truth. Editing or deleting here recalculates every derived number."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Record transaction
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <Input
            className="pl-9"
            placeholder="Search ticker or company"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={60}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="BUY">Buys</SelectItem>
            <SelectItem value="SELL">Sells</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Newest first</SelectItem>
            <SelectItem value="ticker">Ticker</SelectItem>
            <SelectItem value="amount">Largest amount</SelectItem>
            <SelectItem value="pl">Realized P/L</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-border border-b text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Ticker</th>
              <th className="px-4 py-3 text-right font-medium">Shares</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Gross</th>
              <th className="px-4 py-3 text-right font-medium">Commission</th>
              <th className="px-4 py-3 text-right font-medium">Cash</th>
              <th className="px-4 py-3 text-right font-medium">Capital / Profit</th>
              <th className="px-4 py-3 text-right font-medium">Realized P/L</th>
              <th className="px-4 py-3 text-right font-medium">Shares after</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="text-muted-foreground px-4 py-6">
                  No transactions match.
                </td>
              </tr>
            )}
            {rows.map((e) => {
              const tx = e.transaction!;
              return (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="tnum px-4 py-3 whitespace-nowrap">{e.date}</td>
                  <td className="px-4 py-3">
                    <Badge variant={tx.type === "BUY" ? "secondary" : "outline"}>{tx.type}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{tx.ticker}</div>
                    <div className="text-muted-foreground text-xs">{tx.company ?? "—"}</div>
                  </td>
                  <td className="tnum px-4 py-3 text-right">{num(tx.shares, 4)}</td>
                  <td className="tnum px-4 py-3 text-right">{money(tx.price, currency)}</td>
                  <td className="tnum px-4 py-3 text-right">{money(e.gross, currency)}</td>
                  <td className="tnum px-4 py-3 text-right">{money(e.commission, currency)}</td>
                  <td className={`tnum px-4 py-3 text-right ${e.cashDelta >= 0 ? "text-gain" : ""}`}>
                    {money(e.cashDelta, currency)}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-xs">
                    {money(e.capitalPortion, currency)} / {money(e.profitPortion, currency)}
                    {tx.source_override && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        manual
                      </Badge>
                    )}
                  </td>
                  <td
                    className={`tnum px-4 py-3 text-right ${tx.type === "SELL" ? (e.realizedNet >= 0 ? "text-gain" : "text-loss") : ""}`}
                  >
                    {tx.type === "SELL" ? money(e.realizedNet, currency) : "—"}
                  </td>
                  <td className="tnum px-4 py-3 text-right">{num(e.sharesAfter, 4)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setAudit(e)}>
                      Audit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(tx);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(tx)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accounting={accounting}
        currency={currency}
        onSaved={refresh}
        editing={editing}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.type} {deleting?.shares} {deleting?.ticker} on {deleting?.trade_date}. All shares, cost basis,
              capital, profit and cash figures will be recalculated from the remaining records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!audit} onOpenChange={(v) => !v && setAudit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>What this transaction changed</DialogTitle>
          </DialogHeader>
          {audit && (
            <div className="space-y-2 text-sm">
              <AuditRow label="Cash" before={audit.before.cash} after={audit.after.cash} currency={currency} />
              <AuditRow
                label="Capital cash"
                before={audit.before.capitalCash}
                after={audit.after.capitalCash}
                currency={currency}
              />
              <AuditRow
                label="Profit cash"
                before={audit.before.profitCash}
                after={audit.after.profitCash}
                currency={currency}
              />
              <AuditRow label="Shares" before={audit.before.shares} after={audit.after.shares} />
              <AuditRow
                label="Cost basis"
                before={audit.before.costBasis}
                after={audit.after.costBasis}
                currency={currency}
              />
              <AuditRow label="Avg cost" before={audit.before.avgCost} after={audit.after.avgCost} currency={currency} />
              <div className="border-border mt-3 space-y-1 border-t pt-3">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Commission</span>
                  <span className="tnum">{money(audit.commission, currency)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Cost of shares sold</span>
                  <span className="tnum">{money(audit.costOfSharesSold, currency)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Gross realized P/L</span>
                  <span className="tnum">{money(audit.realizedGross, currency)}</span>
                </p>
                <p className="flex justify-between font-semibold">
                  <span>Net realized P/L</span>
                  <span className="tnum">{money(audit.realizedNet, currency)}</span>
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditRow({
  label,
  before,
  after,
  currency,
}: {
  label: string;
  before: number;
  after: number;
  currency?: string;
}) {
  const fmt = (v: number) => (currency ? money(v, currency) : num(v, 4));
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="tnum text-sm">
        {fmt(before)} → <strong>{fmt(after)}</strong>
      </span>
    </div>
  );
}
