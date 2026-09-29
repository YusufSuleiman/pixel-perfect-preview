import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_SETTINGS, usePortfolio, useRefreshPortfolio } from "@/lib/portfolio-data";
import type { CostBasisMethod } from "@/lib/accounting";
import { BackupPanel } from "@/components/BackupPanel";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — EGX Ledger" },
      { name: "description", content: "Account name, currency, cost basis method and default commission rates." },
      { property: "og:title", content: "Settings — EGX Ledger" },
      { property: "og:description", content: "Configure your ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const { settings, isLoading } = usePortfolio();
  const refresh = useRefreshPortfolio();
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      const { user_id: _u, ...rest } = settings;
      setForm(rest);
    }
  }, [settings]);

  async function save() {
    if (!user) return undefined;
    const buy = Number(form.default_buy_commission_rate);
    const sell = Number(form.default_sell_commission_rate);
    if (!form.account_name.trim()) { toast.error("Account name is required"); return; }
    if (!(buy >= 0 && buy <= 10) || !(sell >= 0 && sell <= 10)) { toast.error("Commission rates must be 0–10%"); return; }
    setSaving(true);
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        account_name: form.account_name.trim().slice(0, 100),
        currency: form.currency.trim().toUpperCase().slice(0, 5) || "EGP",
        cost_basis_method: form.cost_basis_method,
        default_buy_commission_rate: buy,
        default_sell_commission_rate: sell,
        date_format: form.date_format,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved");
    refresh();
  }

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="max-w-xl">
      <PageHeader title="Settings" description="Changes apply instantly — every figure is recalculated from your records." />
      <div className="panel space-y-4 p-5">
        <div>
          <Label>Account name</Label>
          <Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
        </div>
        <div>
          <Label>Currency</Label>
          <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        </div>
        <div>
          <Label>Cost basis method</Label>
          <Select value={form.cost_basis_method} onValueChange={(v) => setForm({ ...form, cost_basis_method: v as CostBasisMethod })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WAC">Weighted average cost (EGX standard)</SelectItem>
              <SelectItem value="FIFO">First in, first out</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Default buy commission (%)</Label>
            <Input type="number" step="0.001" value={form.default_buy_commission_rate}
              onChange={(e) => setForm({ ...form, default_buy_commission_rate: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Default sell commission (%)</Label>
            <Input type="number" step="0.001" value={form.default_sell_commission_rate}
              onChange={(e) => setForm({ ...form, default_sell_commission_rate: Number(e.target.value) })} />
          </div>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
      </div>
      <BackupPanel />
    </div>
  );
}
