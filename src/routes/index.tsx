import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Calculator, Coins, LineChart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EGX Ledger — Investment Accounting for the Egyptian Stock Exchange" },
      {
        name: "description",
        content:
          "A transaction-based ledger for EGX investors: capital vs profit provenance, weighted average cost, commissions, realized and unrealized P/L.",
      },
      { property: "og:title", content: "EGX Ledger — Investment Accounting" },
      {
        property: "og:description",
        content: "Track every buy, sell, deposit and commission with auditable, transaction-based accounting.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Calculator,
    title: "Accounting first",
    body: "Every figure is recomputed from your raw transactions — no editable totals, no drift.",
  },
  {
    icon: Coins,
    title: "Capital vs profit",
    body: "Know exactly how much of your holdings is your own money and how much is reinvested profit.",
  },
  {
    icon: LineChart,
    title: "Per-stock truth",
    body: "Weighted average cost, partial sales, realized and unrealized results for every ticker.",
  },
  {
    icon: ShieldCheck,
    title: "Auditable",
    body: "Inspect what each transaction changed: cash, shares, cost basis, capital and profit.",
  },
];

function Landing() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <span className="text-lg font-extrabold tracking-tight">
          EGX<span className="text-primary">Ledger</span>
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10 pb-16 md:pt-20">
          <p className="label-xs">Egyptian Stock Exchange · personal ledger</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-extrabold md:text-6xl">
            Your portfolio, accounted for to the piastre.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-2xl text-base md:text-lg">
            Record every purchase, sale, deposit and commission. The ledger derives your capital, realized profit,
            reinvested profit, cash and per-stock performance — consistently, and always from source records.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Open your ledger <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel p-5">
              <f.icon className="text-primary h-5 w-5" />
              <h2 className="mt-4 font-semibold">{f.title}</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
