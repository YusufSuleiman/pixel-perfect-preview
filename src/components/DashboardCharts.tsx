import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AccountingResult } from "@/lib/accounting";
import { money } from "@/lib/format";

const COLORS = ["var(--primary)", "var(--gain)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];
const tip = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

export function DashboardCharts({ accounting, currency }: { accounting: AccountingResult; currency: string }) {
  const t = accounting.totals;
  const open = accounting.positions.filter((p) => p.shares > 0);

  // Account value at cost over time: cash + cost basis of all holdings after each event
  const basis = new Map<string, number>();
  const byDate = new Map<string, { date: string; cash: number; invested: number; deposits: number }>();
  let deposits = 0;
  for (const e of accounting.ledger) {
    if (e.transaction) basis.set(e.transaction.ticker.toUpperCase(), e.after.costBasis);
    if (e.cashMovement?.kind === "DEPOSIT") deposits += e.cashMovement.amount;
    if (e.cashMovement?.kind === "WITHDRAWAL") deposits -= e.cashMovement.amount;
    const invested = [...basis.values()].reduce((s, v) => s + v, 0);
    byDate.set(e.date, { date: e.date, cash: Math.round(e.after.cash), invested: Math.round(invested), deposits: Math.round(deposits) });
  }
  const timeline = [...byDate.values()];

  const allocation = [
    ...open.map((p) => ({ name: p.ticker, value: Math.round(p.marketValue) })),
    ...(t.cash > 0.5 ? [{ name: "Cash", value: Math.round(t.cash) }] : []),
  ];

  const composition = [
    { name: "Capital", cash: Math.round(t.capitalCash), invested: Math.round(t.capitalInvested) },
    { name: "Profit", cash: Math.round(t.profitCash), invested: Math.round(t.profitReinvested) },
  ];

  const perStock = accounting.positions.map((p) => ({ name: p.ticker, realized: Math.round(p.realizedNet), unrealized: Math.round(p.unrealized) }));

  if (timeline.length === 0) return null;
  const fmt = (v: number) => money(v, currency, 0);

  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      <div className="panel p-4 lg:col-span-2">
        <h3 className="mb-2 text-sm font-medium">Account growth (at cost) vs money you put in</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis fontSize={11} stroke="var(--muted-foreground)" width={70} />
            <Tooltip contentStyle={tip} formatter={(v: number) => fmt(v)} />
            <Legend />
            <Area type="stepAfter" dataKey="invested" stackId="a" name="In stocks" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.35} />
            <Area type="stepAfter" dataKey="cash" stackId="a" name="Cash" stroke="var(--gain)" fill="var(--gain)" fillOpacity={0.25} />
            <Area type="stepAfter" dataKey="deposits" name="Net deposits" stroke="var(--muted-foreground)" strokeDasharray="4 4" fill="none" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 text-sm font-medium">Allocation</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {allocation.map((a, i) => <Cell key={a.name} fill={a.name === "Cash" ? "var(--muted-foreground)" : COLORS[i % (COLORS.length - 1)]} />)}
            </Pie>
            <Tooltip contentStyle={tip} formatter={(v: number) => fmt(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 text-sm font-medium">Your capital vs profit — cash and invested</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={composition}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis fontSize={11} stroke="var(--muted-foreground)" width={70} />
            <Tooltip contentStyle={tip} formatter={(v: number) => fmt(v)} />
            <Legend />
            <Bar dataKey="invested" stackId="a" name="Invested" fill="var(--primary)" />
            <Bar dataKey="cash" stackId="a" name="Cash" fill="var(--gain)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {perStock.length > 0 && (
        <div className="panel p-4 lg:col-span-2">
          <h3 className="mb-2 text-sm font-medium">Profit / loss by stock</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={perStock}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis fontSize={11} stroke="var(--muted-foreground)" width={70} />
              <Tooltip contentStyle={tip} formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="realized" name="Realized (net)" fill="var(--gain)" />
              <Bar dataKey="unrealized" name="Unrealized" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
