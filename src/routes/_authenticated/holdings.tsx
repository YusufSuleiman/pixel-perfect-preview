import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriceDialog } from "@/components/PriceDialog";
import { usePortfolio, useRefreshPortfolio } from "@/lib/portfolio-data";
import { money, num, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/holdings")({
  head: () => ({
    meta: [
      { title: "Holdings — EGX Ledger" },
      { name: "description", content: "Every position with weighted average cost, market value and P/L." },
      { property: "og:title", content: "Holdings — EGX Ledger" },
      { property: "og:description", content: "Positions, average cost and unrealized results." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Holdings,
});

function Holdings() {
  const { accounting, currency } = usePortfolio();
  const refresh = useRefreshPortfolio();
  const [priceFor, setPriceFor] = useState<{ ticker: string; price: number | null } | null>(null);

  return (
    <div>
      <PageHeader title="Holdings" description="Grouped by ticker — the primary identifier for every security." />

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-border border-b text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Ticker</th>
              <th className="px-4 py-3 text-right font-medium">Shares</th>
              <th className="px-4 py-3 text-right font-medium">Avg cost</th>
              <th className="px-4 py-3 text-right font-medium">Invested</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Market value</th>
              <th className="px-4 py-3 text-right font-medium">Unrealized</th>
              <th className="px-4 py-3 text-right font-medium">Realized (net)</th>
              <th className="px-4 py-3 text-right font-medium">Commissions</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {accounting.positions.length === 0 && (
              <tr>
                <td colSpan={10} className="text-muted-foreground px-4 py-6">
                  No transactions recorded yet.
                </td>
              </tr>
            )}
            {accounting.positions.map((p) => (
              <tr key={p.ticker} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link to="/stocks/$ticker" params={{ ticker: p.ticker }} className="font-semibold hover:underline">
                    {p.ticker}
                  </Link>
                  <div className="text-muted-foreground text-xs">{p.company ?? "—"}</div>
                </td>
                <td className="tnum px-4 py-3 text-right">{num(p.shares, 4)}</td>
                <td className="tnum px-4 py-3 text-right">{money(p.avgCost, currency)}</td>
                <td className="tnum px-4 py-3 text-right">{money(p.costBasis, currency)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="tnum">{p.marketPrice == null ? "—" : money(p.marketPrice, currency)}</div>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {p.marketPrice == null ? "at cost" : p.priceSource === "MANUAL" ? "manual" : "live"}
                  </Badge>
                </td>
                <td className="tnum px-4 py-3 text-right">{money(p.marketValue, currency)}</td>
                <td className={`tnum px-4 py-3 text-right ${p.unrealized >= 0 ? "text-gain" : "text-loss"}`}>
                  {p.shares > 0 ? `${money(p.unrealized, currency)} (${pct(p.unrealizedPct)})` : "—"}
                </td>
                <td className={`tnum px-4 py-3 text-right ${p.realizedNet >= 0 ? "text-gain" : "text-loss"}`}>
                  {money(p.realizedNet, currency)}
                </td>
                <td className="tnum px-4 py-3 text-right">{money(p.totalCommission, currency)}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPriceFor({ ticker: p.ticker, price: p.marketPrice })}
                  >
                    Set price
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground mt-3 text-xs">
        Prices you type in are labelled “manual” and are never presented as live quotes. Positions without a price are
        valued at cost.
      </p>

      <PriceDialog
        open={!!priceFor}
        onOpenChange={(v) => !v && setPriceFor(null)}
        onSaved={refresh}
        ticker={priceFor?.ticker ?? ""}
        currentPrice={priceFor?.price ?? null}
      />
    </div>
  );
}
