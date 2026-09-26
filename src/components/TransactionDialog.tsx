import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, today } from "@/lib/format";
import type { AccountingResult, Transaction } from "@/lib/accounting";
import { round2 } from "@/lib/accounting";

const schema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1, { message: "Ticker is required" })
    .max(15)
    .regex(/^[A-Za-z0-9.\-]+$/, { message: "Ticker may only contain letters, numbers, dot or dash" }),
  company: z.string().trim().max(120).optional(),
  trade_date: z.string().min(10, { message: "Pick a date" }),
  shares: z.number().positive({ message: "Shares must be greater than zero" }).max(1_000_000_000),
  price: z.number().nonnegative({ message: "Price cannot be negative" }).max(10_000_000),
  commission: z.number().nonnegative({ message: "Commission cannot be negative" }).max(10_000_000),
  notes: z.string().trim().max(500).optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounting: AccountingResult;
  currency: string;
  onSaved: () => void;
  editing?: Transaction | null;
  defaultType?: "BUY" | "SELL";
  defaultTicker?: string;
}

export function TransactionDialog({
  open,
  onOpenChange,
  accounting,
  currency,
  onSaved,
  editing,
  defaultType = "BUY",
  defaultTicker,
}: Props) {
  const [type, setType] = useState<"BUY" | "SELL">(defaultType);
  const [ticker, setTicker] = useState(defaultTicker ?? "");
  const [company, setCompany] = useState("");
  const [date, setDate] = useState(today());
  const [price, setPrice] = useState("");
  const [shares, setShares] = useState("");
  const [totalCash, setTotalCash] = useState("");
  const [entryMode, setEntryMode] = useState<"shares" | "total">("shares");
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState(false);
  const [capitalPortion, setCapitalPortion] = useState("");
  const [profitPortion, setProfitPortion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setTicker(editing.ticker);
      setCompany(editing.company ?? "");
      setDate(editing.trade_date);
      setPrice(String(editing.price));
      setShares(String(editing.shares));
      setCommission(String(editing.commission));
      setNotes(editing.notes ?? "");
      setOverride(editing.source_override);
      setCapitalPortion(editing.capital_portion == null ? "" : String(editing.capital_portion));
      setProfitPortion(editing.profit_portion == null ? "" : String(editing.profit_portion));
      setEntryMode("shares");
    } else {
      setType(defaultType);
      setTicker(defaultTicker ?? "");
      setCompany("");
      setDate(today());
      setPrice("");
      setShares("");
      setTotalCash("");
      setCommission("");
      setNotes("");
      setOverride(false);
      setCapitalPortion("");
      setProfitPortion("");
      setEntryMode("shares");
    }
  }, [open, editing, defaultType, defaultTicker]);

  const priceNum = Number(price) || 0;
  const commissionNum = Number(commission) || 0;

  const derivedShares = useMemo(() => {
    if (entryMode === "shares") return Number(shares) || 0;
    const total = Number(totalCash) || 0;
    const gross = type === "BUY" ? total - commissionNum : total + commissionNum;
    return priceNum > 0 ? round2(gross / priceNum) : 0;
  }, [entryMode, shares, totalCash, commissionNum, priceNum, type]);

  const gross = round2(derivedShares * priceNum);
  const cashImpact = type === "BUY" ? gross + commissionNum : gross - commissionNum;

  const position = accounting.positions.find((p) => p.ticker === ticker.trim().toUpperCase());
  const costOfSold = position && position.shares > 0 ? (position.costBasis / position.shares) * derivedShares : 0;
  const realizedGross = gross - costOfSold;

  const { capitalCash, profitCash } = accounting.totals;
  const autoSplit = useMemo(() => {
    const total = capitalCash + profitCash;
    if (type !== "BUY" || cashImpact <= 0) return { capital: 0, profit: 0 };
    if (total <= 0) return { capital: cashImpact, profit: 0 };
    if (cashImpact >= total) return { capital: capitalCash, profit: cashImpact - capitalCash };
    const cap = (cashImpact * capitalCash) / total;
    return { capital: cap, profit: cashImpact - cap };
  }, [type, cashImpact, capitalCash, profitCash]);

  async function save() {
    const parsed = schema.safeParse({
      ticker,
      company: company || undefined,
      trade_date: date,
      shares: derivedShares,
      price: priceNum,
      commission: commissionNum,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    if (override && type === "BUY") {
      const sum = (Number(capitalPortion) || 0) + (Number(profitPortion) || 0);
      if (Math.abs(sum - cashImpact) > 0.01) {
        toast.error(`Capital + profit must equal the cash required (${money(cashImpact, currency)}).`);
        return;
      }
    }

    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const payload = {
        user_id: auth.user.id,
        trade_date: parsed.data.trade_date,
        type,
        ticker: parsed.data.ticker.toUpperCase(),
        company: parsed.data.company ?? null,
        shares: parsed.data.shares,
        price: parsed.data.price,
        commission: parsed.data.commission,
        source_override: type === "BUY" ? override : false,
        capital_portion: type === "BUY" && override ? Number(capitalPortion) || 0 : null,
        profit_portion: type === "BUY" && override ? Number(profitPortion) || 0 : null,
        notes: parsed.data.notes ?? null,
        updated_at: new Date().toISOString(),
      };
      const res = editing
        ? await supabase.from("transactions").update(payload).eq("id", editing.id)
        : await supabase.from("transactions").insert(payload);
      if (res.error) throw res.error;
      toast.success(editing ? "Transaction updated" : "Transaction recorded");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the transaction");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "Record transaction"}</DialogTitle>
          <DialogDescription>
            Enter what you know — shares or total cash. Everything else is calculated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "BUY" | "SELL")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tx-ticker">Ticker</Label>
              <Input
                id="tx-ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="ETEL"
                maxLength={15}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-company">Company (optional)</Label>
              <Input
                id="tx-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Telecom Egypt"
                maxLength={120}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tx-price">Price per share</Label>
              <Input
                id="tx-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-comm">Commission</Label>
              <Input
                id="tx-comm"
                inputMode="decimal"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="15"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tx-qty">{entryMode === "shares" ? "Number of shares" : "Total cash amount"}</Label>
              <button
                type="button"
                className="text-primary text-xs font-medium"
                onClick={() => setEntryMode(entryMode === "shares" ? "total" : "shares")}
              >
                {entryMode === "shares" ? "Enter total amount instead" : "Enter shares instead"}
              </button>
            </div>
            {entryMode === "shares" ? (
              <Input
                id="tx-qty"
                inputMode="decimal"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="10"
              />
            ) : (
              <Input
                id="tx-qty"
                inputMode="decimal"
                value={totalCash}
                onChange={(e) => setTotalCash(e.target.value)}
                placeholder="1015"
              />
            )}
          </div>

          <div className="bg-muted/40 space-y-1.5 rounded-md p-3 text-sm">
            <Row label="Shares" value={derivedShares.toLocaleString("en-US", { maximumFractionDigits: 4 })} />
            <Row label="Gross value" value={money(gross, currency)} />
            <Row label="Commission" value={money(commissionNum, currency)} />
            <Row
              label={type === "BUY" ? "Total cash required" : "Net proceeds"}
              value={money(cashImpact, currency)}
              strong
            />
            {type === "BUY" && !override && (
              <>
                <Row label="Funded from capital" value={money(autoSplit.capital, currency)} />
                <Row label="Funded from profit" value={money(autoSplit.profit, currency)} />
              </>
            )}
            {type === "SELL" && position && (
              <>
                <Row label="Cost basis of shares sold" value={money(costOfSold, currency)} />
                <Row label="Gross realized P/L" value={money(realizedGross, currency)} />
                <Row label="Net realized P/L" value={money(realizedGross - commissionNum, currency)} strong />
                <Row
                  label="Shares remaining after"
                  value={Math.max(0, position.shares - derivedShares).toLocaleString("en-US", {
                    maximumFractionDigits: 4,
                  })}
                />
              </>
            )}
          </div>

          {type === "BUY" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="tx-override">Override funding source</Label>
                  <p className="text-muted-foreground text-xs">Set exactly how much capital and profit was used.</p>
                </div>
                <Switch id="tx-override" checked={override} onCheckedChange={setOverride} />
              </div>
              {override && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="tx-cap">From capital</Label>
                    <Input
                      id="tx-cap"
                      inputMode="decimal"
                      value={capitalPortion}
                      onChange={(e) => setCapitalPortion(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tx-prof">From profit</Label>
                    <Input
                      id="tx-prof"
                      inputMode="decimal"
                      value={profitPortion}
                      onChange={(e) => setProfitPortion(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tx-notes">Notes (optional)</Label>
            <Textarea
              id="tx-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Record transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`tnum text-sm ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
