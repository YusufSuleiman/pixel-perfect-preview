import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/lib/portfolio-data";
import { money, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — EGX Ledger" },
      { name: "description", content: "Capital, profit, commission and per-stock performance reports with CSV export." },
      { property: "og:title", content: "Reports — EGX Ledger" },
      { property: "og:description", content: "Portfolio reports and CSV export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reports,
});

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const { accounting, currency, data } = usePortfolio();
  const t = accounting.totals;

  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: "Capital",
      rows: [
        ["Total deposits", money(t.totalDeposits, currency)],
        ["Capital withdrawn", money(t.capitalWithdrawn, currency)],
        ["Gross capital", money(t.grossCapital, currency)],
        ["Net capital (after commissions & fees)", money(t.netCapital, currency)],
        ["Capital invested in stocks", money(t.capitalInvested, currency)],
        ["Capital cash", money(t.capitalCash, currency)],
      ],
    },
    {
      title: "Profit",
      rows: [
        ["Realized gross profit", money(t.realizedGrossProfit, currency)],
        ["Realized net profit", money(t.realizedNetProfit, currency)],
        ["Profit reinvested", money(t.profitReinvested, currency)],
        ["Profit withdrawn", money(t.profitWithdrawn, currency)],
        ["Profit cash", money(t.profitCash, currency)],
        ["Unrealized P/L", `${money(t.unrealizedPL, currency)} (${pct(t.unrealizedPct)})`],
        ["Overall P/L", `${money(t.overallPL, currency)} (${pct(t.overallReturnPct)})`],
      ],
    },
    {
      title: "Costs",
      rows: [
        ["Buy commissions", money(t.buyCommission, currency)],
        ["Sell commissions", money(t.sellCommission, currency)],
        ["Other fees", money(t.otherFees, currency)],
        ["Total commissions & fees", money(t.totalCommission, currency)],
      ],
    },
  ];

  function exportTransactions() {
    const rows: (string | number)[][] = [["Date", "Type", "Ticker", "Company", "Shares", "Price", "Commission", "Notes"]];
    (data?.transactions ?? []).forEach((x) =>
      rows.push([x.trade_date, x.type, x.ticker, x.company ?? "", x.shares, x.price, x.commission, x.notes ?? ""]),
    );
    downloadCsv("transactions.csv", rows);
  }
  function exportLedger() {
    const rows: (string | number)[][] = [
      ["Date", "Entry", "Cash change", "Capital portion", "Profit portion", "Commission", "Realized net", "Cash after", "Capital cash after", "Profit cash after"],
    ];
    accounting.ledger.forEach((e) =>
      rows.push([e.date, e.label, e.cashDelta, e.capitalPortion, e.profitPortion, e.commission, e.realizedNet, e.after.cash, e.after.capitalCash, e.after.profitCash]),
    );
    downloadCsv("audit-ledger.csv", rows);
  }
  function exportHoldings() {
    const rows: (string | number)[][] = [["Ticker", "Shares", "Avg cost", "Cost basis", "Market value", "Unrealized", "Realized net", "Commissions"]];
    accounting.positions.forEach((p) =>
      rows.push([p.ticker, p.shares, p.avgCost, p.costBasis, p.marketValue, p.unrealized, p.realizedNet, p.totalCommission]),
    );
    downloadCsv("holdings.csv", rows);
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Summaries derived from your records. Export to CSV for spreadsheets or your accountant."
        actions={
          <>
            <Button variant="outline" onClick={exportTransactions}>Transactions CSV</Button>
            <Button variant="outline" onClick={exportLedger}>Audit ledger CSV</Button>
            <Button variant="outline" onClick={exportHoldings}>Holdings CSV</Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((s) => (
          <div key={s.title} className="panel p-4">
            <h2 className="font-semibold">{s.title}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {s.rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="tnum text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="panel mt-6 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">Per-stock performance</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-muted-foreground border-border border-b text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Ticker</th>
              <th className="px-4 py-3 text-right font-medium">Bought</th>
              <th className="px-4 py-3 text-right font-medium">Sold</th>
              <th className="px-4 py-3 text-right font-medium">Gross invested</th>
              <th className="px-4 py-3 text-right font-medium">Proceeds</th>
              <th className="px-4 py-3 text-right font-medium">Realized net</th>
              <th className="px-4 py-3 text-right font-medium">Unrealized</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {accounting.positions.map((p) => {
              const total = p.realizedNet + p.unrealized;
              return (
                <tr key={p.ticker}>
                  <td className="px-4 py-3 font-semibold">{p.ticker}</td>
                  <td className="tnum px-4 py-3 text-right">{p.sharesBought}</td>
                  <td className="tnum px-4 py-3 text-right">{p.sharesSold}</td>
                  <td className="tnum px-4 py-3 text-right">{money(p.grossInvested, currency)}</td>
                  <td className="tnum px-4 py-3 text-right">{money(p.saleProceeds, currency)}</td>
                  <td className={`tnum px-4 py-3 text-right ${p.realizedNet >= 0 ? "text-gain" : "text-loss"}`}>{money(p.realizedNet, currency)}</td>
                  <td className={`tnum px-4 py-3 text-right ${p.unrealized >= 0 ? "text-gain" : "text-loss"}`}>{money(p.unrealized, currency)}</td>
                  <td className={`tnum px-4 py-3 text-right font-semibold ${total >= 0 ? "text-gain" : "text-loss"}`}>{money(total, currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
