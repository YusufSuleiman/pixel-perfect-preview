import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Stat } from "@/components/Stat";
import { usePortfolio } from "@/lib/portfolio-data";
import { money, num, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/stocks/$ticker")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.ticker} — EGX Ledger` },
      { name: "description", content: `Position, cost basis and trade history for ${params.ticker}.` },
      { property: "og:title", content: `${params.ticker} — EGX Ledger` },
      { property: "og:description", content: `Performance of ${params.ticker} in your portfolio.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StockDetail,
});

function StockDetail() {
  const { ticker } = Route.useParams();
  const { accounting, currency, isLoading } = usePortfolio();
  const p = accounting.positions.find((x) => x.ticker === ticker);
  const trades = accounting.ledger.filter((e) => e.transaction?.ticker === ticker).reverse();

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!p)
    return (
      <div>
        <p>No records for {ticker}.</p>
        <Link to="/holdings" className="text-primary text-sm hover:underline">Back to holdings</Link>
      </div>
    );

  return (
    <div>
      <Link to="/holdings" className="text-muted-foreground text-sm hover:underline">← Holdings</Link>
      <PageHeader title={p.ticker} description={p.company ?? undefined} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Shares held" value={num(p.shares, 4)} />
        <Stat label="Average cost" value={money(p.avgCost, currency)} />
        <Stat label="Cost basis" value={money(p.costBasis, currency)} accent="capital" />
        <Stat label="Market value" value={money(p.marketValue, currency)} hint={p.marketPrice == null ? "Valued at cost" : `Manual price as of ${p.priceAsOf?.slice(0, 10) ?? "—"}`} />
        <Stat label="Unrealized" value={`${money(p.unrealized, currency)} (${pct(p.unrealizedPct)})`} tone={p.unrealized >= 0 ? "gain" : "loss"} />
        <Stat label="Realized (net)" value={money(p.realizedNet, currency)} tone={p.realizedNet >= 0 ? "gain" : "loss"} accent="profit" />
        <Stat label="Commissions" value={money(p.totalCommission, currency)} accent="fee" />
        <Stat label="Funded by" value={`${money(p.capitalInvested, currency)} capital`} hint={`${money(p.profitInvested, currency)} reinvested profit`} />
      </div>

      <div className="panel mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-border border-b text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 text-right font-medium">Shares</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Commission</th>
              <th className="px-4 py-3 text-right font-medium">Realized net</th>
              <th className="px-4 py-3 text-right font-medium">Shares after</th>
              <th className="px-4 py-3 text-right font-medium">Avg cost after</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {trades.map((e) => (
              <tr key={e.id}>
                <td className="tnum px-4 py-3">{e.date}</td>
                <td className={`px-4 py-3 font-medium ${e.transaction?.type === "BUY" ? "text-gain" : "text-loss"}`}>{e.transaction?.type}</td>
                <td className="tnum px-4 py-3 text-right">{num(e.transaction?.shares ?? 0, 4)}</td>
                <td className="tnum px-4 py-3 text-right">{money(e.transaction?.price ?? 0, currency)}</td>
                <td className="tnum px-4 py-3 text-right">{money(e.commission, currency)}</td>
                <td className="tnum px-4 py-3 text-right">{e.transaction?.type === "SELL" ? money(e.realizedNet, currency) : "—"}</td>
                <td className="tnum px-4 py-3 text-right">{num(e.after.shares, 4)}</td>
                <td className="tnum px-4 py-3 text-right">{money(e.after.avgCost, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
