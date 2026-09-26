import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Plus, Wallet } from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "@/components/TransactionDialog";
import { CashDialog } from "@/components/CashDialog";
import { usePortfolio, useRefreshPortfolio } from "@/lib/portfolio-data";
import { money, num, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — EGX Ledger" },
      { name: "description", content: "Capital, profit, cash, commissions and portfolio value at a glance." },
      { property: "og:title", content: "Dashboard — EGX Ledger" },
      { property: "og:description", content: "Your investment accounting at a glance." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { accounting, currency, settings, isLoading } = usePortfolio();
  const refresh = useRefreshPortfolio();
  const [txOpen, setTxOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const t = accounting.totals;

  return (
    <div>
      <PageHeader
        title={settings?.account_name ?? "Portfolio"}
        description="Every figure below is recalculated from your transaction and cash ledgers."
        actions={
          <>
            <Button variant="outline" onClick={() => setCashOpen(true)}>
              <Wallet className="mr-2 h-4 w-4" /> Cash
            </Button>
            <Button onClick={() => setTxOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Transaction
            </Button>
          </>
        }
      />

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {accounting.warnings.length > 0 && (
        <div className="border-destructive/40 bg-destructive/10 mb-6 rounded-lg border p-4">
          <div className="text-destructive flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" /> Accounting warnings
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {[...new Set(accounting.warnings)].slice(0, 6).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total account value" value={money(t.totalAccountValue, currency)} hint="Portfolio + cash" />
        <Stat
          label="Overall return"
          value={pct(t.overallReturnPct)}
          tone={t.overallPL >= 0 ? "gain" : "loss"}
          hint={`${money(t.overallPL, currency)} vs deposits`}
        />
        <Stat
          label="Portfolio value"
          value={money(t.portfolioValue, currency)}
          hint={`${t.unpricedPositions} position(s) valued at cost`}
        />
        <Stat label="Available cash" value={money(t.cash, currency)} accent="cash" />
      </div>

      <div className="mt-6">
        <SectionTitle title="Capital and profit" description="Where the money in your account came from." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Gross capital (new money)"
            value={money(t.grossCapital, currency)}
            accent="capital"
            hint="Total deposits you personally added"
          />
          <Stat
            label="Net capital in system"
            value={money(t.netCapital, currency)}
            accent="capital"
            hint={`${money(t.capitalCash, currency)} cash · ${money(t.capitalInvested, currency)} invested`}
          />
          <Stat
            label="Realized profit (net)"
            value={money(t.realizedNetProfit, currency)}
            tone={t.realizedNetProfit >= 0 ? "gain" : "loss"}
            accent="profit"
            hint={`Gross ${money(t.realizedGrossProfit, currency)} − sell commissions ${money(t.sellCommission, currency)}`}
          />
          <Stat
            label="Unrealized P/L"
            value={money(t.unrealizedPL, currency)}
            tone={t.unrealizedPL >= 0 ? "gain" : "loss"}
            accent="profit"
            hint={pct(t.unrealizedPct)}
          />
          <Stat label="Profit available (cash)" value={money(t.profitCash, currency)} accent="profit" />
          <Stat label="Profit reinvested" value={money(t.profitReinvested, currency)} accent="profit" />
          <Stat label="Profit withdrawn" value={money(t.profitWithdrawn, currency)} accent="profit" />
          <Stat label="Profit remaining in system" value={money(t.profitRemaining, currency)} accent="profit" />
        </div>
      </div>

      <div className="mt-6">
        <SectionTitle title="Costs and flows" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total commissions" value={money(t.totalCommission, currency)} accent="fee" />
          <Stat label="Buy commissions" value={money(t.buyCommission, currency)} accent="fee" />
          <Stat label="Sell commissions" value={money(t.sellCommission, currency)} accent="fee" />
          <Stat label="Other fees" value={money(t.otherFees, currency)} accent="fee" />
          <Stat label="Total deposits" value={money(t.totalDeposits, currency)} accent="cash" />
          <Stat label="Total withdrawals" value={money(t.totalWithdrawals, currency)} accent="cash" />
          <Stat label="Total money invested (gross)" value={money(t.totalInvestedGross, currency)} />
          <Stat
            label="Shares owned"
            value={num(t.sharesOwned)}
            hint={`${t.openPositions} open position${t.openPositions === 1 ? "" : "s"}`}
          />
        </div>
      </div>

      <div className="mt-6">
        <SectionTitle title="Open positions" />
        <div className="panel divide-border divide-y">
          {accounting.positions.filter((p) => p.shares > 0).length === 0 && (
            <p className="text-muted-foreground p-5 text-sm">
              No open positions yet. Record a deposit, then your first purchase.
            </p>
          )}
          {accounting.positions
            .filter((p) => p.shares > 0)
            .map((p) => (
              <Link
                key={p.ticker}
                to="/stocks/$ticker"
                params={{ ticker: p.ticker }}
                className="hover:bg-muted/40 flex items-center justify-between gap-4 p-4 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{p.ticker}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {num(p.shares)} shares · avg {money(p.avgCost, currency)} ·{" "}
                    {p.marketPrice == null ? "no market price" : `${p.priceSource.toLowerCase()} price`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum font-semibold">{money(p.marketValue, currency)}</p>
                  <p className={`tnum text-xs ${p.unrealized >= 0 ? "text-gain" : "text-loss"}`}>
                    {money(p.unrealized, currency)} ({pct(p.unrealizedPct)})
                  </p>
                </div>
              </Link>
            ))}
        </div>
      </div>

      <TransactionDialog
        open={txOpen}
        onOpenChange={setTxOpen}
        accounting={accounting}
        currency={currency}
        onSaved={refresh}
      />
      <CashDialog open={cashOpen} onOpenChange={setCashOpen} onSaved={refresh} />
    </div>
  );
}
